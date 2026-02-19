from datetime import datetime
from io import BytesIO
import json
import os
from pathlib import Path
import re
import time
from typing import Any, Optional
import unicodedata
from urllib.error import URLError
from urllib.request import urlopen
from uuid import uuid4
from zipfile import ZIP_DEFLATED, ZipFile
from xml.etree import ElementTree as ET

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from reportlab.graphics import renderPDF
from psycopg.rows import dict_row
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from svglib.svglib import svg2rlg

from app.core.db import get_connection
from app.core.config import settings

router = APIRouter(prefix="/recepcion", tags=["recepcion"])

try:
    from PIL import Image
except Exception:  # pragma: no cover - optional dependency
    Image = None

try:
    import boto3
except Exception:  # pragma: no cover - optional dependency
    boto3 = None

try:
    import pypdfium2 as pdfium
except Exception:  # pragma: no cover - optional dependency
    pdfium = None

_EXTRACTION_ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}
_WHITESPACE_RE = re.compile(r"\s+")


def _normalize_ocr_text(value: str) -> str:
    return _WHITESPACE_RE.sub(" ", (value or "").strip())


def _normalize_key_label(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value or "")
    normalized = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    normalized = normalized.upper()
    normalized = re.sub(r"[^A-Z0-9 ]+", " ", normalized)
    return _normalize_ocr_text(normalized)


def _extract_with_regex(text: str, patterns: list[str]) -> str:
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE | re.MULTILINE)
        if match:
            candidate = _normalize_ocr_text(match.group(1))
            if candidate:
                return candidate
    return ""


def _pdf_first_page_to_png(file_bytes: bytes) -> bytes:
    if not pdfium:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Falta dependencia pypdfium2 para procesar PDF escaneado.",
        )
    pdf = pdfium.PdfDocument(BytesIO(file_bytes))
    if len(pdf) == 0:
        return b""
    page = pdf[0]
    try:
        bitmap = page.render(scale=2.0, rotation=0)
        image = bitmap.to_pil()
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        return buffer.getvalue()
    finally:
        page.close()
        pdf.close()


def _get_block_text(block: dict[str, Any], block_map: dict[str, dict[str, Any]]) -> str:
    parts: list[str] = []
    for rel in block.get("Relationships", []):
        if rel.get("Type") != "CHILD":
            continue
        for child_id in rel.get("Ids", []):
            child = block_map.get(child_id, {})
            if child.get("BlockType") == "WORD":
                word = child.get("Text", "")
                if word:
                    parts.append(word)
            elif child.get("BlockType") == "SELECTION_ELEMENT" and child.get("SelectionStatus") == "SELECTED":
                parts.append("X")
    return _normalize_ocr_text(" ".join(parts))


def _extract_textract_data(file_bytes: bytes, extension: str) -> dict[str, Any]:
    if not boto3:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Falta dependencia boto3 para usar Textract.",
        )
    region = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "us-east-1"
    client = boto3.client("textract", region_name=region)
    document_bytes = file_bytes if extension in {".jpg", ".jpeg", ".png"} else _pdf_first_page_to_png(file_bytes)
    if not document_bytes:
        return ""
    try:
        response = client.analyze_document(
            Document={"Bytes": document_bytes},
            FeatureTypes=["FORMS"],
        )
    except Exception:
        response = client.detect_document_text(Document={"Bytes": document_bytes})

    blocks = response.get("Blocks", [])
    block_map = {block.get("Id"): block for block in blocks if block.get("Id")}

    lines = [
        _normalize_ocr_text(block.get("Text", ""))
        for block in blocks
        if block.get("BlockType") == "LINE" and block.get("Text")
    ]

    word_boxes: list[dict[str, Any]] = []
    selected_boxes: list[dict[str, float]] = []
    for block in blocks:
        block_type = block.get("BlockType")
        geometry = block.get("Geometry", {}).get("BoundingBox", {}) or {}
        left = float(geometry.get("Left", 0.0) or 0.0)
        top = float(geometry.get("Top", 0.0) or 0.0)
        width = float(geometry.get("Width", 0.0) or 0.0)
        height = float(geometry.get("Height", 0.0) or 0.0)
        if block_type == "WORD":
            text = _normalize_ocr_text(block.get("Text", ""))
            if text:
                word_boxes.append(
                    {
                        "text": text,
                        "norm": _normalize_key_label(text),
                        "left": left,
                        "top": top,
                        "width": width,
                        "height": height,
                    }
                )
        elif (
            block_type == "SELECTION_ELEMENT"
            and block.get("SelectionStatus") == "SELECTED"
        ):
            selected_boxes.append(
                {"left": left, "top": top, "width": width, "height": height}
            )

    kv_pairs: dict[str, dict[str, str]] = {}
    for block in blocks:
        if block.get("BlockType") != "KEY_VALUE_SET":
            continue
        if "KEY" not in block.get("EntityTypes", []):
            continue

        key_text = _get_block_text(block, block_map)
        if not key_text:
            continue

        value_text = ""
        for rel in block.get("Relationships", []):
            if rel.get("Type") != "VALUE":
                continue
            for value_id in rel.get("Ids", []):
                value_block = block_map.get(value_id)
                if not value_block:
                    continue
                value_text = _get_block_text(value_block, block_map)
                if value_text:
                    break
            if value_text:
                break

        normalized_key = _normalize_key_label(key_text)
        if normalized_key:
            kv_pairs[normalized_key] = {"key": key_text, "value": value_text}

    return {
        "text": "\n".join(lines),
        "lines": lines,
        "kv": kv_pairs,
        "word_boxes": word_boxes,
        "selected_boxes": selected_boxes,
    }


def _pick_from_kv(
    kv_pairs: dict[str, dict[str, str]],
    contains_all: list[list[str]],
) -> tuple[str, str]:
    for normalized_key, entry in kv_pairs.items():
        for token_group in contains_all:
            if all(token in normalized_key for token in token_group):
                value = _normalize_ocr_text(entry.get("value", ""))
                if value:
                    return value, entry.get("key", normalized_key)
    return "", ""


def _detect_aseguradora(ocr_text: str) -> str:
    upper = (ocr_text or "").upper()
    if "QUALITAS" in upper:
        return "Qualitas"
    if "CHUBB" in upper:
        return "CHUBB"
    return ""


def _parse_orden_fields(
    ocr_text: str,
    kv_pairs: Optional[dict[str, dict[str, str]]] = None,
    ocr_lines: Optional[list[str]] = None,
    textract_meta: Optional[dict[str, Any]] = None,
) -> tuple[dict, dict]:
    upper_text = (ocr_text or "").upper()
    aseguradora = _detect_aseguradora(upper_text)
    kv = kv_pairs or {}
    normalized_lines = [_normalize_ocr_text(line) for line in (ocr_lines or []) if _normalize_ocr_text(line)]
    field_debug: dict[str, str] = {}

    def from_kv(field_name: str, candidates: list[list[str]]) -> str:
        value, source = _pick_from_kv(kv, candidates)
        if value:
            field_debug[field_name] = f"kv:{source}"
        return value

    def from_regex(field_name: str, patterns: list[str]) -> str:
        value = _extract_with_regex(ocr_text, patterns)
        if value:
            field_debug[field_name] = "regex"
        return value

    def detect_transmision() -> str:
        # Try KV first for documents where checkbox state is included in form extraction.
        for key, entry in kv.items():
            if "TRANSMISION" not in key and "TRANSMISSION" not in key:
                continue
            combined = _normalize_key_label(f"{entry.get('key', '')} {entry.get('value', '')}")
            if re.search(r"AUTOMAT(?:ICA|IC)\s*(X|XX|CHECK|SELECT|SI|YES|TRUE|1|■|█|☒|☑)", combined):
                return "Automatica"
            if re.search(r"MANUAL\s*(X|XX|CHECK|SELECT|SI|YES|TRUE|1|■|█|☒|☑)", combined):
                return "Manual"
            if re.search(r"(X|■|█|☒|☑)\s*AUTOMAT(?:ICA|IC)", combined):
                return "Automatica"
            if re.search(r"(X|■|█|☒|☑)\s*MANUAL", combined):
                return "Manual"

        # Fallback using OCR lines around "Transmision".
        if normalized_lines:
            for idx, line in enumerate(normalized_lines):
                up = _normalize_key_label(line)
                if "TRANSMISION" not in up and "TRANSMISSION" not in up:
                    continue
                window = " ".join(_normalize_key_label(item) for item in normalized_lines[idx : idx + 4])
                if re.search(r"AUTOMAT(?:ICA|IC)\s*(X|■|█|☒|☑)", window) or re.search(
                    r"(X|■|█|☒|☑)\s*AUTOMAT(?:ICA|IC)", window
                ):
                    return "Automatica"
                if re.search(r"MANUAL\s*(X|■|█|☒|☑)", window) or re.search(
                    r"(X|■|█|☒|☑)\s*MANUAL", window
                ):
                    return "Manual"

        # Geometry fallback: link selected checkbox to nearest transmission label.
        meta = textract_meta or {}
        labels = [
            item
            for item in (meta.get("word_boxes") or [])
            if re.search(r"AUTOMAT|AUTOMATIC|MANUAL", str(item.get("norm") or ""))
        ]
        checks = meta.get("selected_boxes") or []
        if labels and checks:
            best_label = ""
            best_score = None
            for check in checks:
                cx = check["left"] + (check["width"] / 2)
                cy = check["top"] + (check["height"] / 2)
                for label in labels:
                    lx = float(label.get("left", 0.0)) + (float(label.get("width", 0.0)) / 2)
                    ly = float(label.get("top", 0.0)) + (float(label.get("height", 0.0)) / 2)
                    # Favor same-row matches and near-horizontal checkboxes.
                    score = ((cx - lx) ** 2) + (((cy - ly) * 1.8) ** 2)
                    if best_score is None or score < best_score:
                        best_score = score
                        best_label = str(label.get("norm") or "")
            if best_label:
                if "AUTOMAT" in best_label:
                    field_debug["transmision"] = "geometry_checkbox"
                    return "Automatica"
                if "MANUAL" in best_label:
                    field_debug["transmision"] = "geometry_checkbox"
                    return "Manual"
        return ""

    def normalize_time(raw_value: str) -> str:
        if not raw_value:
            return ""
        match = re.search(r"(\d{1,2})[:.](\d{2})", raw_value)
        if not match:
            return ""
        hour = int(match.group(1))
        minute = int(match.group(2))
        if hour > 23 or minute > 59:
            return ""
        return f"{hour:02d}:{minute:02d}"

    def normalize_date(raw_value: str) -> str:
        raw = _normalize_ocr_text(raw_value or "")
        if not raw:
            return ""
        raw = re.sub(r"\s*([\/\-])\s*", r"\1", raw)

        # Direct numeric formats.
        candidate = raw.replace("-", "/")
        for fmt in ("%d/%m/%Y", "%d/%m/%y", "%Y/%m/%d"):
            try:
                return datetime.strptime(candidate, fmt).date().isoformat()
            except ValueError:
                continue

        # Formats with month names, e.g. 12/dic/2025.
        month_map = {
            "ENE": "01",
            "FEB": "02",
            "MAR": "03",
            "ABR": "04",
            "MAY": "05",
            "JUN": "06",
            "JUL": "07",
            "AGO": "08",
            "SEP": "09",
            "OCT": "10",
            "NOV": "11",
            "DIC": "12",
            "JAN": "01",
            "APR": "04",
            "AUG": "08",
            "DEC": "12",
        }
        month_match = re.search(
            r"\b(\d{1,2})(?:[\/\-]|\s+)([A-Z]{3})(?:[\/\-]|\s+)(\d{4})\b",
            _normalize_key_label(raw),
        )
        if month_match:
            day = int(month_match.group(1))
            month = month_map.get(month_match.group(2))
            year = int(month_match.group(3))
            if month:
                try:
                    return datetime(year=year, month=int(month), day=day).date().isoformat()
                except ValueError:
                    return ""
        return ""

    raw_fecha = from_kv(
        "fecha_adm",
        [
            ["FECHA", "DATE"],
            ["FECHA"],
        ],
    ) or from_regex(
        "fecha_adm",
        [
            r"FECHA\s*/?\s*DATE[^\n\r]*?(\d{2}/\d{2}/\d{4})",
            r"FECHA[^\n\r]*?(\d{2}/\d{2}/\d{4})",
        ],
    )

    fecha_iso = normalize_date(raw_fecha)

    raw_hora = from_kv(
        "hr_adm",
        [
            ["HORA", "TIME"],
            ["HORA"],
        ],
    ) or from_regex(
        "hr_adm",
        [
            r"HORA\s*/?\s*TIME[^\n\r]*?(\d{1,2}[:.]\d{2})",
            r"\b(\d{1,2}[:.]\d{2})\s*HRS?\b",
        ],
    )
    hora = normalize_time(raw_hora)

    if aseguradora == "CHUBB":
        # CHUBB uses "Ocurrencia" with datetime in the same cell; prefer it over generic FECHA.
        raw_ocurrencia_fecha = from_kv("fecha_adm", [["OCURRENCIA"]]) or from_regex(
            "fecha_adm",
            [
                r"OCURRENCIA[^\n\r]*?(\d{1,2}[\/\-][A-Z]{3}[\/\-]\d{4})",
                r"OCURRENCIA[^\n\r]*?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})",
            ],
        )
        ocurrencia_iso = normalize_date(raw_ocurrencia_fecha)
        if ocurrencia_iso:
            fecha_iso = ocurrencia_iso
            field_debug["fecha_adm"] = "ocurrencia_datetime"

        raw_ocurrencia_hora = from_regex(
            "hr_adm",
            [
                r"OCURRENCIA[^\n\r]*?(\d{1,2}[:.]\d{2})(?::\d{2})?",
                r"\b(\d{1,2}[:.]\d{2})(?::\d{2})\b",
            ],
        )
        if not raw_ocurrencia_hora:
            match = re.search(r"\b(\d{1,2}[:.]\d{2})(?::\d{2})\b", ocr_text or "", flags=re.IGNORECASE)
            if match:
                raw_ocurrencia_hora = match.group(1)
        if not raw_ocurrencia_hora and normalized_lines:
            for idx, line in enumerate(normalized_lines):
                if "OCURRENCIA" not in line.upper():
                    continue
                window = normalized_lines[idx : idx + 4]
                for candidate in window:
                    match = re.search(r"\b(\d{1,2}[:.]\d{2})(?::\d{2})?\b", candidate)
                    if match:
                        raw_ocurrencia_hora = match.group(1)
                        break
                if raw_ocurrencia_hora:
                    break
        if not raw_ocurrencia_hora and raw_ocurrencia_fecha:
            raw_ocurrencia_hora = raw_ocurrencia_fecha
        ocurrencia_hora = normalize_time(raw_ocurrencia_hora)
        if ocurrencia_hora:
            hora = ocurrencia_hora
            field_debug["hr_adm"] = "ocurrencia_datetime"

    if not hora and normalized_lines:
        # Last-resort for documents where HORA/Ocurrencia keys are split by OCR.
        for line in normalized_lines:
            match = re.search(r"\b(\d{1,2}[:.]\d{2})(?::\d{2})?\b", line)
            if match:
                hora = normalize_time(match.group(1))
                if hora:
                    field_debug["hr_adm"] = "line_time_fallback"
                    break

    reporte = from_kv(
        "reporte_siniestro",
        [
            ["REPORTE"],
            ["REPORT"],
            ["SINIESTRO"],
        ],
    ) or from_regex(
        "reporte_siniestro",
        [
            r"N[°º]?\s*REPORTE[^\n\r:]*[:\s]+([A-Z0-9-]{6,})",
            r"REPORT\s*N[°º]?[^\n\r:]*[:\s]+([A-Z0-9-]{6,})",
            r"N[°º]?\s*SINIESTRO[^\n\r:]*[:\s]+([A-Z0-9-]{6,})",
        ],
    )

    nb_cliente = from_kv(
        "nb_cliente",
        [
            ["NOMBRE", "RAZON", "CLIENTE"],
            ["CUSTOMER", "NAME"],
        ],
    ) or from_regex(
        "nb_cliente",
        [
            r"NOMBRE O RAZ[ÓO]N SOCIAL DEL CLIENTE[^\n\r]*[\r\n]+([^\r\n]+)",
            r"CUSTOMER NAME[^\n\r]*[\r\n]+([^\r\n]+)",
        ],
    )

    tel_cliente = from_kv(
        "tel_cliente",
        [
            ["TELEFONO", "PHONE"],
            ["TELEFONO"],
        ],
    ) or from_regex(
        "tel_cliente",
        [
            r"TEL[ÉE]FONO\s*/?\s*PHONE\s*N[°º]?[^\n\r]*[:\s]+([0-9][0-9 \-]{7,})",
        ],
    )

    # Qualitas OCR often has multiple phone labels; prioritize the phone tied to the customer block.
    if normalized_lines:
        customer_idx = -1
        email_label_idx = -1
        for idx, line in enumerate(normalized_lines):
            up = line.upper()
            if customer_idx < 0 and (
                "NOMBRE O RAZON SOCIAL DEL CLIENTE" in up
                or "CUSTOMER NAME OR CORPORATE NAME" in up
            ):
                customer_idx = idx
            if customer_idx >= 0 and email_label_idx < 0 and ("E MAIL" in up or "EMAIL" in up):
                email_label_idx = idx
                break
        if customer_idx >= 0:
            start = customer_idx + 1
            stop = email_label_idx if email_label_idx > start else min(start + 8, len(normalized_lines))
            contextual_phone = ""
            for line in normalized_lines[start:stop]:
                digits = re.sub(r"\D", "", line or "")
                if len(digits) >= 10 and "POLIZA" not in line.upper() and "TEL" not in line.upper():
                    contextual_phone = digits
                    break
            if contextual_phone:
                tel_cliente = contextual_phone
                field_debug["tel_cliente"] = "lines_after_customer_header"

    tel_cliente = re.sub(r"\D", "", tel_cliente or "")
    if len(tel_cliente) > 10:
        tel_cliente = tel_cliente[-10:]

    email_cliente = from_kv(
        "email_cliente",
        [
            ["E", "MAIL"],
        ],
    )
    if not email_cliente:
        email_match = re.search(r"([A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,})", upper_text, flags=re.IGNORECASE)
        email_cliente = (email_match.group(1) if email_match else "").lower()
        if email_cliente:
            field_debug["email_cliente"] = "regex"
    if normalized_lines:
        email_idx = -1
        for idx, line in enumerate(normalized_lines):
            up = line.upper()
            if "E MAIL" in up or "EMAIL" in up:
                email_idx = idx
                break
        if email_idx >= 0:
            for line in normalized_lines[email_idx + 1 : email_idx + 6]:
                if "@" in line:
                    possible = _normalize_ocr_text(line).lower()
                    if re.search(r"[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}", possible):
                        email_cliente = possible
                        field_debug["email_cliente"] = "line_after_email_label"
                        break
    email_cliente = email_cliente.lower()

    marca_raw = from_kv(
        "marca_vehiculo",
        [
            ["MARCA", "BRAND"],
            ["MARCA"],
        ],
    ) or from_regex(
        "marca_vehiculo",
        [
            r"MARCA\s*/?\s*BRAND[^\n\r]*[\r\n]+([^\r\n]+)",
            r"MARCA[^\n\r:]*[:\s]+([^\r\n]+)",
        ],
    )

    tipo_raw = from_kv(
        "tipo_vehiculo",
        [
            ["TIPO", "TYPE"],
            ["TIPO"],
        ],
    ) or from_regex(
        "tipo_vehiculo",
        [
            r"TIPO\s*/?\s*TYPE[^\n\r]*[\r\n]+([^\r\n]+)",
            r"TIPO[^\n\r:]*[:\s]+([^\r\n]+)",
        ],
    )

    modelo_anio = from_kv(
        "modelo_anio",
        [
            ["MODELO", "ANO"],
            ["MODEL", "YEAR"],
        ],
    ) or from_regex(
        "modelo_anio",
        [
            r"MODELO\s*\(A[ÑN]O\)[^\n\r]*[\r\n]+([0-9]{4})",
            r"MODEL\s*/?\s*YEAR[^\n\r]*[\r\n]+([0-9]{4})",
            r"\b((?:19|20)\d{2})\b",
        ],
    )
    model_year_match = re.search(r"\b((?:19|20)\d{2})\b", modelo_anio or "")
    modelo_anio = model_year_match.group(1) if model_year_match else ""

    if aseguradora == "CHUBB" and normalized_lines:
        # In CHUBB, "Modelo" is a dedicated field (often just the year).
        for idx, line in enumerate(normalized_lines):
            if line.upper().strip() == "MODELO":
                for next_line in normalized_lines[idx + 1 : idx + 4]:
                    year_match = re.search(r"\b((?:19|20)\d{2})\b", next_line)
                    if year_match:
                        modelo_anio = year_match.group(1)
                        field_debug["modelo_anio"] = "line_after_modelo"
                        break
                if modelo_anio:
                    break

    color_vehiculo = from_kv(
        "color_vehiculo",
        [
            ["COLOR", "COLOUR"],
            ["COLOR"],
        ],
    ) or from_regex(
        "color_vehiculo",
        [
            r"COLOR\s*/?\s*COLOUR?[^\n\r]*[\r\n]+([^\r\n]+)",
            r"COLOR[^\n\r:]*[:\s]+([^\r\n]+)",
        ],
    )

    serie_auto = from_kv(
        "serie_auto",
        [
            ["SERIE"],
            ["VIN"],
        ],
    ) or from_regex(
        "serie_auto",
        [
            r"N[°º]?\s*DE SERIE\s*/?\s*SERIES?\s*N[°º]?[^\n\r]*[\r\n]+([A-Z0-9]{8,})",
            r"VIN[^\n\r:]*[:\s]+([A-Z0-9]{8,})",
        ],
    )

    placas = from_kv(
        "placas",
        [
            ["PLACAS", "LICENSE"],
            ["PLACAS"],
        ],
    ) or from_regex(
        "placas",
        [
            r"PLACAS\s*/?\s*LICENSE PLATE[^\n\r]*[\r\n]+([A-Z0-9\-]{5,})",
            r"PLACAS[^\n\r:]*[:\s]+([A-Z0-9\-]{5,})",
        ],
    )

    kilometraje = from_kv(
        "kilometraje",
        [
            ["KILOMETRAJE", "MILEAGE"],
            ["KILOMETRAJE"],
        ],
    ) or from_regex(
        "kilometraje",
        [
            r"KILOMETRAJE\s*/?\s*MILEAGE[^\n\r]*[\r\n]+([0-9]{2,7})",
            r"KILOMETRAJE[^\n\r:]*[:\s]+([0-9]{2,7})",
        ],
    )
    kilometraje = re.sub(r"\D", "", kilometraje or "")

    descripcion_siniestro = from_regex(
        "descripcion_siniestro",
        [
            r"DESCRIPCI[ÓO]N DE DA[ÑN]OS A REPARAR[^\r\n]*(?:\r?\n)+([^\r\n]{6,})",
            r"DESCRIPTION OF DAMAGES TO REPAIR[^\r\n]*(?:\r?\n)+([^\r\n]{6,})",
            r"DESCRIPCI[ÓO]N DE DA[ÑN]OS A REPARAR[^\r\n]*\s+([A-Z0-9ÁÉÍÓÚÑ,\.\-\s]{8,})",
        ],
    )
    if descripcion_siniestro:
        upper_desc = descripcion_siniestro.upper()
        if "EN CASO DE INUND" in upper_desc or "IN CASE OF FLOOD" in upper_desc:
            descripcion_siniestro = ""
            field_debug.pop("descripcion_siniestro", None)
    if not descripcion_siniestro and normalized_lines:
        header_idx = -1
        for idx, line in enumerate(normalized_lines):
            up = line.upper()
            if "DESCRIPCION DE DANOS A REPARAR" in up or "DESCRIPTION OF DAMAGES TO REPAIR" in up:
                header_idx = idx
                break
        if header_idx >= 0:
            candidates: list[str] = []
            for line in normalized_lines[header_idx + 1 : header_idx + 30]:
                up = line.upper()
                if "DANOS PREEXISTENTES" in up or "PREEXISTING DAMAGE" in up:
                    break
                if (
                    "EN CASO DE INUND" in up
                    or "IN CASE OF FLOOD" in up
                    or "DESCRIPCION DE DANOS" in up
                    or "DESCRIPTION OF DAMAGES" in up
                    or "LADO DERECHO" in up
                    or "RIGHT SIDE" in up
                    or "LADO IZQUIERDO" in up
                    or "LEFT SIDE" in up
                    or "FRENTE" in up
                    or "POSTERIOR" in up
                    or "NIVEL " in up
                    or up.startswith("LEVEL")
                    or "POSIBLE AGRAVAMIENTO" in up
                    or "SOLO PERDIDA" in up
                    or "ESTRIBO" in up
                    or line.startswith("(")
                ):
                    continue
                if len(line) >= 8 and re.search(r"[A-ZÁÉÍÓÚÑ]", up):
                    candidates.append(line)
                if len(candidates) >= 2:
                    break
            if candidates:
                descripcion_siniestro = candidates[0].strip()
                field_debug["descripcion_siniestro"] = "lines_after_section_header"

    if aseguradora == "CHUBB":
        # CHUBB damage description is commonly in "Piezas dañadas".
        if not descripcion_siniestro and normalized_lines:
            piezas_idx = -1
            for idx, line in enumerate(normalized_lines):
                up = line.upper()
                if "PIEZAS DANADAS" in up or "PIEZAS DAÑADAS" in up:
                    piezas_idx = idx
                    break
            if piezas_idx >= 0:
                candidates: list[str] = []
                for line in normalized_lines[piezas_idx + 1 : piezas_idx + 10]:
                    up = line.upper()
                    if "DANOS MECANICOS" in up or "DAÑOS MECANICOS" in up or "NOTAS GENERALES" in up:
                        break
                    if (
                        not line
                        or "PREEXIST" in up
                        or "NOTAS" in up
                        or "SECCION FRONTAL" in up
                        or "SECCION" == up.strip()
                        or "SECEION FRONTAL" in up
                        or "SECEION" == up.strip()
                    ):
                        continue
                    if len(line) >= 5:
                        candidates.append(line)
                if candidates:
                    non_generic = []
                    for c in candidates:
                        cu = c.upper()
                        if (
                            "SECCION" in cu
                            or "SECEION" in cu
                            or "SECTION" in cu
                            or cu.strip() in {"FRONTAL", "SECCION FRONTAL", "SECEION FRONTAL"}
                        ):
                            continue
                        non_generic.append(c)
                    if non_generic:
                        candidates = non_generic
                    if not candidates:
                        damage_keywords = (
                            "FACIA",
                            "FARO",
                            "PUERTA",
                            "DEFENSA",
                            "COFRE",
                            "SALPICADERA",
                            "ESPEJO",
                            "PARRILLA",
                            "TAPA",
                            "COSTADO",
                        )
                        for c in normalized_lines[piezas_idx + 1 : piezas_idx + 12]:
                            cu = c.upper()
                            if any(token in cu for token in damage_keywords):
                                candidates.append(c)
                                break
                    descripcion_siniestro = ", ".join(candidates[:2])
                    field_debug["descripcion_siniestro"] = "chubb_piezas_danadas"

    if not descripcion_siniestro and aseguradora == "QUALITAS" and normalized_lines:
        # Extra fallback for Qualitas where description line may be detached from the section header.
        desc_idx = -1
        for idx, line in enumerate(normalized_lines):
            up = line.upper()
            if "DESCRIPCION DE DANOS A REPARAR" in up or "DESCRIPTION OF DAMAGES TO REPAIR" in up:
                desc_idx = idx
                break
        if desc_idx >= 0:
            damage_keywords = (
                "SALPICADERA",
                "ESPEJO",
                "FARO",
                "FACIA",
                "DEFENSA",
                "PUERTA",
                "COSTADO",
                "COFRE",
                "TOLDO",
                "CANTONERA",
                "PARRILLA",
                "STOP",
                "ESTRIBO",
            )
            for line in normalized_lines[desc_idx + 1 : desc_idx + 25]:
                up = line.upper()
                if "DANOS PREEXISTENTES" in up or "PREEXISTING DAMAGE" in up:
                    break
                if "EN CASO DE INUND" in up or "IN CASE OF FLOOD" in up:
                    continue
                if any(token in up for token in damage_keywords):
                    descripcion_siniestro = line
                    field_debug["descripcion_siniestro"] = "qualitas_damage_keywords"
                    break

    # For some insurer templates, TIPO contains "MARCA ... MODELO", while MARCA may contain dealer name.
    marca_vehiculo = marca_raw
    tipo_vehiculo = tipo_raw
    if tipo_raw and aseguradora != "CHUBB":
        tipo_clean = _normalize_ocr_text(tipo_raw)
        brand_model_match = re.match(r"^([A-Z0-9]{2,})(?:\s*\([A-Z0-9]{1,4}\))?\s+(.+)$", tipo_clean)
        if brand_model_match:
            candidate_brand = brand_model_match.group(1)
            candidate_type = _normalize_ocr_text(brand_model_match.group(2))
            if candidate_type:
                tipo_vehiculo = candidate_type
                if candidate_brand:
                    marca_vehiculo = candidate_brand
                    field_debug["marca_vehiculo"] = "heuristic_from_tipo"
                field_debug["tipo_vehiculo"] = "heuristic_from_tipo"

    if aseguradora == "CHUBB":
        # CHUBB "Marca" is usually reliable; "Tipo" can be long, keep a concise class when possible.
        marca_clean = _normalize_ocr_text(marca_vehiculo)
        if marca_clean:
            marca_vehiculo = marca_clean
        tipo_clean = _normalize_ocr_text(tipo_vehiculo)
        if tipo_clean:
            class_match = re.search(r"\bCLASE\s*([A-Z0-9]+)\b", tipo_clean, flags=re.IGNORECASE)
            if class_match:
                tipo_vehiculo = f"CLASE {class_match.group(1).upper()}"
                field_debug["tipo_vehiculo"] = "chubb_class_from_tipo"
            else:
                tipo_vehiculo = tipo_clean

        # Customer name is often in signature section above "Conductor".
        if normalized_lines:
            signature_name = ""
            for idx, line in enumerate(normalized_lines):
                if "CONDUCTOR" in line.upper() and idx > 0:
                    start = max(0, idx - 8)
                    window = normalized_lines[start:idx]
                    candidates: list[str] = []
                    for candidate in window:
                        candidate_up = candidate.upper()
                        compact = _normalize_key_label(candidate)
                        if (
                            candidate
                            and "AJUSTADOR" not in candidate_up
                            and "NOMBRE" not in candidate_up
                            and "FIRMA" not in candidate_up
                            and "CONDUCTOR" not in candidate_up
                            and "NOTAS GENERALES" not in candidate_up
                            and "NOTAS" != candidate_up.strip()
                            and "@" not in candidate
                            and ":" not in candidate
                            and "." not in candidate
                            and not re.search(r"\d", candidate)
                            and "CHUBB" not in candidate_up
                            and "FRAUDE" not in candidate_up
                            and "GUARDIA" not in candidate_up
                            and re.fullmatch(r"[A-ZÁÉÍÓÚÑ ]{6,}", compact or "")
                            and len(candidate_up.split()) >= 2
                            and len(candidate_up.split()) <= 6
                            and re.search(r"[A-ZÁÉÍÓÚÑ]", candidate_up)
                        ):
                            candidates.append(candidate)
                    if candidates:
                        signature_name = candidates[0]
                        break
            if signature_name:
                nb_cliente = signature_name
                field_debug["nb_cliente"] = "line_before_conductor"

    fields = {
        "seguro_comp": aseguradora,
        "reporte_siniestro": reporte,
        "fecha_adm": fecha_iso,
        "hr_adm": hora,
        "nb_cliente": nb_cliente,
        "tel_cliente": tel_cliente,
        "email_cliente": email_cliente,
        "marca_vehiculo": marca_vehiculo,
        "tipo_vehiculo": tipo_vehiculo,
        "modelo_anio": modelo_anio,
        "color_vehiculo": color_vehiculo,
        "serie_auto": serie_auto,
        "placas": placas,
        "kilometraje": kilometraje,
        "transmision": detect_transmision(),
        "descripcion_siniestro": descripcion_siniestro,
    }

    cleaned = {key: _normalize_ocr_text(value or "") for key, value in fields.items()}
    return cleaned, field_debug


def ensure_recepcion_media_table(conn):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS recepcion_media (
            id BIGSERIAL PRIMARY KEY,
            recepcion_id BIGINT NOT NULL REFERENCES recepciones(id) ON DELETE CASCADE,
            media_type VARCHAR(20) NOT NULL,
            file_path TEXT NOT NULL,
            original_name TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_recepcion_media_recepcion_id
        ON recepcion_media(recepcion_id)
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_recepcion_media_recepcion_type
        ON recepcion_media(recepcion_id, media_type)
        """
    )


def ensure_orden_admision_transmision_column(conn):
    conn.execute(
        """
        ALTER TABLE orden_admision
        ADD COLUMN IF NOT EXISTS transmision VARCHAR(20)
        """
    )


def _draw_wrapped_text(
    pdf: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    max_width: float,
    line_height: float = 14,
    font_name: str = "Helvetica",
    font_size: int = 10,
):
    pdf.setFont(font_name, font_size)
    words = (text or "").split()
    if not words:
        return y - line_height

    line = []
    current_width = 0.0
    space_width = stringWidth(" ", font_name, font_size)
    for word in words:
        word_width = stringWidth(word, font_name, font_size)
        if line and current_width + space_width + word_width > max_width:
            pdf.drawString(x, y, " ".join(line))
            y -= line_height
            line = [word]
            current_width = word_width
        else:
            if line:
                current_width += space_width + word_width
            else:
                current_width = word_width
            line.append(word)
    if line:
        pdf.drawString(x, y, " ".join(line))
        y -= line_height
    return y


def _safe_pdf_text(value: Optional[object]) -> str:
    if value is None:
        return "-"
    text = str(value).strip()
    return text if text else "-"


def _fit_text_single_line(text: str, max_width: float, font_name: str, font_size: int) -> str:
    value = (text or "").strip()
    if not value:
        return ""
    if stringWidth(value, font_name, font_size) <= max_width:
        return value
    suffix = "..."
    if stringWidth(suffix, font_name, font_size) > max_width:
        return ""
    trimmed = value
    while trimmed and stringWidth(trimmed + suffix, font_name, font_size) > max_width:
        trimmed = trimmed[:-1]
    return (trimmed + suffix) if trimmed else suffix


def _pretty_part_name(value: str) -> str:
    token = (value or "").strip().upper()
    if not token:
        return ""
    token = token.replace("_", " ")
    token = token.replace(" IZQ", " IZQUIERDA").replace(" DER", " DERECHA")
    token = token.replace("IZQ ", "IZQUIERDA ").replace("DER ", "DERECHA ")
    return token.title()


def _build_colored_damage_svg(svg_path: Path, selected_parts: list[str], fill_color: str) -> bytes:
    if not svg_path.exists():
        return b""
    try:
        tree = ET.parse(svg_path)
    except ET.ParseError:
        return b""

    root = tree.getroot()
    selected = {str(item or "").strip().upper() for item in (selected_parts or []) if str(item or "").strip()}

    # svglib can ignore embedded CSS classes in some SVG exports, so we normalize
    # key style attributes inline to prevent black-filled shapes.
    for elem in root.iter():
        cls = (elem.attrib.get("class") or "").strip()
        if not cls:
            continue
        classes = set(cls.split())
        if "cls-3" in classes:
            elem.set("fill", "none")
            elem.set("stroke", "#6b7280")
            elem.set("stroke-width", "2")
        elif "cls-2" in classes:
            elem.set("fill", "none")
        elif "cls-1" in classes:
            elem.set("fill", "none")
            elem.set("stroke", "none")

    zones = None
    for elem in root.iter():
        elem_id = (elem.attrib.get("id") or "").upper()
        if elem_id == "ZONAS":
            zones = elem
            break

    if zones is None:
        return b""

    # Keep only selected shapes in ZONAS to avoid renderer issues with transparent fills.
    for elem in list(zones):
        elem_id = (elem.attrib.get("id") or "").upper()
        if not elem_id or elem_id not in selected:
            zones.remove(elem)
            continue
        elem.set("fill", fill_color)
        elem.set("fill-opacity", "0.82")
        elem.set("stroke", "none")

    return ET.tostring(root, encoding="utf-8")


def _draw_svg_block(
    pdf: canvas.Canvas,
    svg_bytes: bytes,
    x: float,
    y: float,
    width: float,
    height: float,
):
    if not svg_bytes:
        return
    drawing = svg2rlg(BytesIO(svg_bytes))
    if drawing is None or not drawing.width or not drawing.height:
        return
    # Clip strictly to the target block and normalize using drawing bounds.
    # Some SVGs report width/height poorly; bounds give safer placement.
    try:
        bounds = drawing.getBounds()
        if bounds and len(bounds) == 4:
            min_x, min_y, max_x, max_y = bounds
            content_w = max(max_x - min_x, 1.0)
            content_h = max(max_y - min_y, 1.0)
        else:
            min_x, min_y = 0.0, 0.0
            content_w = max(float(drawing.width), 1.0)
            content_h = max(float(drawing.height), 1.0)
    except Exception:
        min_x, min_y = 0.0, 0.0
        content_w = max(float(drawing.width), 1.0)
        content_h = max(float(drawing.height), 1.0)

    scale = min(width / content_w, height / content_h)
    scale = max(min(scale, 10.0), 0.001)

    pdf.saveState()
    try:
        clip = pdf.beginPath()
        clip.rect(x, y, width, height)
        pdf.clipPath(clip, stroke=0, fill=0)

        tx = x + (width - (content_w * scale)) / 2
        ty = y + (height - (content_h * scale)) / 2
        pdf.translate(tx, ty)
        pdf.scale(scale, scale)
        renderPDF.draw(drawing, pdf, -min_x, -min_y)
    finally:
        pdf.restoreState()


def _prepare_signature_black(signature_path: Path) -> ImageReader | str:
    """
    Convert signature image to black strokes (preserving alpha) for clearer print.
    Falls back to raw file path if PIL is unavailable.
    """
    if Image is None:
        return str(signature_path)
    try:
        img = Image.open(signature_path).convert("RGBA")
        pixels = img.getdata()
        processed = []
        for r, g, b, a in pixels:
            if a == 0:
                processed.append((0, 0, 0, 0))
            else:
                # keep anti-aliasing alpha and force solid black ink
                alpha = max(a, int((r + g + b) / 3))
                processed.append((0, 0, 0, alpha))
        img.putdata(processed)
        out = BytesIO()
        img.save(out, format="PNG")
        out.seek(0)
        return ImageReader(out)
    except Exception:
        return str(signature_path)


@router.get("/health")
def health_check():
    return {"module": "recepcion", "status": "ok"}


@router.post("/transcripciones")
async def transcribe_audio(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Archivo de audio requerido")
    if not boto3:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Falta dependencia boto3 en el backend.",
        )
    if not settings.aws_transcribe_bucket:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AWS_TRANSCRIBE_BUCKET no configurado en el backend.",
        )

    extension = Path(file.filename).suffix.lower()
    extension_map = {
        ".wav": "wav",
        ".mp3": "mp3",
        ".mp4": "mp4",
        ".m4a": "mp4",
        ".flac": "flac",
        ".ogg": "ogg",
        ".webm": "webm",
        ".amr": "amr",
    }
    media_format = extension_map.get(extension)
    content_type = (file.content_type or "").lower()
    valid_audio = bool(media_format) or content_type.startswith("audio/")
    if not media_format and content_type.startswith("audio/"):
        guessed_ext = content_type.replace("audio/", "").split(";")[0].strip()
        media_format = {
            "x-wav": "wav",
            "wav": "wav",
            "mpeg": "mp3",
            "mp3": "mp3",
            "mp4": "mp4",
            "x-m4a": "mp4",
            "flac": "flac",
            "ogg": "ogg",
            "webm": "webm",
            "amr": "amr",
        }.get(guessed_ext)

    if not valid_audio or not media_format:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato de audio no soportado. Usa wav, mp3, mp4/m4a, flac, ogg o webm.",
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El archivo está vacío.")

    region = settings.aws_region or os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "us-east-1"
    bucket = settings.aws_transcribe_bucket
    object_key = f"transcribe/recepcion/{uuid4().hex}{extension or '.webm'}"
    job_name = f"recepcion-transcribe-{uuid4().hex}"

    s3_client = boto3.client("s3", region_name=region)
    transcribe_client = boto3.client("transcribe", region_name=region)

    try:
        s3_client.put_object(
            Bucket=bucket,
            Key=object_key,
            Body=file_bytes,
            ContentType=file.content_type or "application/octet-stream",
        )

        media_uri = f"s3://{bucket}/{object_key}"
        transcribe_client.start_transcription_job(
            TranscriptionJobName=job_name,
            LanguageCode=settings.aws_transcribe_language_code,
            Media={"MediaFileUri": media_uri},
            MediaFormat=media_format,
        )

        deadline = time.time() + max(10, settings.aws_transcribe_timeout_seconds)
        transcript_file_uri = ""
        while time.time() < deadline:
            job = transcribe_client.get_transcription_job(TranscriptionJobName=job_name).get(
                "TranscriptionJob", {}
            )
            status_name = job.get("TranscriptionJobStatus")
            if status_name == "COMPLETED":
                transcript_file_uri = (
                    job.get("Transcript", {}).get("TranscriptFileUri", "") if job else ""
                )
                break
            if status_name == "FAILED":
                reason = job.get("FailureReason") or "Error desconocido en AWS Transcribe."
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Transcribe falló: {reason}",
                )
            time.sleep(max(1, settings.aws_transcribe_poll_seconds))

        if not transcript_file_uri:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="Transcripción excedió el tiempo de espera.",
            )

        try:
            with urlopen(transcript_file_uri) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (URLError, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"No se pudo leer resultado de Transcribe: {exc}",
            ) from exc

        transcripts = payload.get("results", {}).get("transcripts", [])
        cleaned_text = (transcripts[0].get("transcript", "") if transcripts else "").strip()
        if not cleaned_text:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="No se obtuvo texto del audio enviado.",
            )
        return {"text": cleaned_text}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudo transcribir el audio con AWS Transcribe: {exc}",
        ) from exc
    finally:
        try:
            transcribe_client.delete_transcription_job(TranscriptionJobName=job_name)
        except Exception:
            pass
        try:
            s3_client.delete_object(Bucket=bucket, Key=object_key)
        except Exception:
            pass


@router.get("/registros")
def list_registros():
    with get_connection() as conn:
        conn.row_factory = dict_row
        rows = conn.execute(
            """
            SELECT
                id,
                folio_recep,
                fecha_recep,
                nb_cliente,
                tel_cliente,
                vehiculo,
                vehiculo_marca,
                vehiculo_modelo,
                vehiculo_anio,
                vehiculo_color,
                vehiculo_tipo,
                placas,
                seguro,
                fecha_entregaestim,
                estatus,
                COALESCE(array_length(partes_siniestro, 1), 0) AS danos_siniestro_count,
                COALESCE(array_length(partes_preexistentes, 1), 0) AS danos_preexistentes_count
            FROM recepciones
            ORDER BY id DESC
            """
        ).fetchall()

    payload = []
    for row in rows:
        vehiculo = row.get("vehiculo")
        if not vehiculo:
            pieces = [
                row.get("vehiculo_marca"),
                row.get("vehiculo_modelo"),
                row.get("vehiculo_anio"),
            ]
            vehiculo = " ".join(str(item) for item in pieces if item)
        payload.append(
            {
                "id": row.get("id"),
                "folio_recep": row.get("folio_recep"),
                "fecha_recep": row.get("fecha_recep"),
                "nb_cliente": row.get("nb_cliente"),
                "tel_cliente": row.get("tel_cliente"),
                "vehiculo": vehiculo,
                "vehiculo_tipo": row.get("vehiculo_tipo"),
                "vehiculo_anio": row.get("vehiculo_anio"),
                "color": row.get("vehiculo_color"),
                "placas": row.get("placas"),
                "seguro": row.get("seguro"),
                "fecha_entregaestim": row.get("fecha_entregaestim"),
                "estatus": row.get("estatus"),
                "danos_siniestro_count": row.get("danos_siniestro_count") or 0,
                "danos_preexistentes_count": row.get("danos_preexistentes_count") or 0,
            }
        )

    return payload


@router.get("/lookup-placas")
def lookup_por_placas(placas: str):
    placas_normalized = (placas or "").strip().upper()
    if not placas_normalized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="placas requerido")

    with get_connection() as conn:
        ensure_orden_admision_transmision_column(conn)
        conn.row_factory = dict_row
        orden = conn.execute(
            """
            SELECT
                reporte_siniestro,
                nb_cliente,
                tel_cliente,
                email_cliente,
                marca_vehiculo,
                tipo_vehiculo,
                modelo_anio,
                color_vehiculo,
                serie_auto,
                placas,
                kilometraje,
                transmision,
                seguro_comp
            FROM orden_admision
            WHERE UPPER(placas) = %s
            ORDER BY id DESC
            LIMIT 1
            """,
            (placas_normalized,),
        ).fetchone()
        if orden:
            return {
                "source": "orden_admision",
                "reporte_siniestro": orden.get("reporte_siniestro"),
                "nb_cliente": orden.get("nb_cliente"),
                "tel_cliente": orden.get("tel_cliente"),
                "email_cliente": orden.get("email_cliente"),
                "vehiculo_marca": orden.get("marca_vehiculo"),
                "vehiculo_modelo": orden.get("modelo_anio"),
                "vehiculo_anio": None,
                "vehiculo_tipo": orden.get("tipo_vehiculo"),
                "vehiculo_color": orden.get("color_vehiculo"),
                "placas": orden.get("placas"),
                "kilometraje": orden.get("kilometraje"),
                "transmision": orden.get("transmision"),
                "seguro": orden.get("seguro_comp"),
            }

        recepcion = conn.execute(
            """
            SELECT
                nb_cliente,
                tel_cliente,
                email_cliente,
                vehiculo_marca,
                vehiculo_modelo,
                vehiculo_anio,
                vehiculo_tipo,
                vehiculo_color,
                placas,
                kilometraje,
                seguro
            FROM recepciones
            WHERE UPPER(placas) = %s
            ORDER BY id DESC
            LIMIT 1
            """,
            (placas_normalized,),
        ).fetchone()

        if recepcion:
            return {
                "source": "recepcion",
                "nb_cliente": recepcion.get("nb_cliente"),
                "tel_cliente": recepcion.get("tel_cliente"),
                "email_cliente": recepcion.get("email_cliente"),
                "vehiculo_marca": recepcion.get("vehiculo_marca"),
                "vehiculo_modelo": recepcion.get("vehiculo_modelo"),
                "vehiculo_anio": recepcion.get("vehiculo_anio"),
                "vehiculo_tipo": recepcion.get("vehiculo_tipo"),
                "vehiculo_color": recepcion.get("vehiculo_color"),
                "placas": recepcion.get("placas"),
                "kilometraje": recepcion.get("kilometraje"),
                "seguro": recepcion.get("seguro"),
            }

    return {"source": None}


@router.get("/ordenes")
def list_ordenes_admision():
    with get_connection() as conn:
        ensure_orden_admision_transmision_column(conn)
        conn.row_factory = dict_row
        rows = conn.execute(
            """
            SELECT
                id,
                reporte_siniestro,
                fecha_adm,
                hr_adm,
                nb_cliente,
                seguro_comp,
                tel_cliente,
                email_cliente,
                marca_vehiculo,
                tipo_vehiculo,
                modelo_anio,
                color_vehiculo,
                serie_auto,
                placas,
                kilometraje,
                transmision,
                danos_siniestro,
                danos_preexistentes,
                descripcion_siniestro,
                descripcion_danospreex,
                archivo_path,
                archivo_nombre,
                archivo_size,
                created_at
            FROM orden_admision
            ORDER BY id DESC
            """
        ).fetchall()

    return rows


class OrdenAdmisionCreate(BaseModel):
    reporte_siniestro: str
    fecha_adm: datetime
    hr_adm: str
    nb_cliente: str
    seguro_comp: Optional[str] = None
    tel_cliente: Optional[str] = None
    email_cliente: Optional[str] = None
    marca_vehiculo: Optional[str] = None
    tipo_vehiculo: Optional[str] = None
    modelo_anio: Optional[str] = None
    color_vehiculo: Optional[str] = None
    serie_auto: Optional[str] = None
    placas: Optional[str] = None
    kilometraje: Optional[int] = None
    transmision: Optional[str] = None
    danos_siniestro: Optional[str] = None
    danos_preexistentes: Optional[str] = None
    descripcion_siniestro: Optional[str] = None
    descripcion_danospreex: Optional[str] = None


class OrdenAdmisionUpdate(BaseModel):
    reporte_siniestro: Optional[str] = None
    fecha_adm: Optional[datetime] = None
    hr_adm: Optional[str] = None
    nb_cliente: Optional[str] = None
    seguro_comp: Optional[str] = None
    tel_cliente: Optional[str] = None
    email_cliente: Optional[str] = None
    marca_vehiculo: Optional[str] = None
    tipo_vehiculo: Optional[str] = None
    modelo_anio: Optional[str] = None
    color_vehiculo: Optional[str] = None
    serie_auto: Optional[str] = None
    placas: Optional[str] = None
    kilometraje: Optional[int] = None
    transmision: Optional[str] = None
    danos_siniestro: Optional[str] = None
    danos_preexistentes: Optional[str] = None
    descripcion_siniestro: Optional[str] = None
    descripcion_danospreex: Optional[str] = None


@router.post("/ordenes", status_code=status.HTTP_201_CREATED)
def create_orden_admision(payload: OrdenAdmisionCreate):
    if not payload.reporte_siniestro.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="reporte_siniestro requerido")
    if not payload.nb_cliente.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="nb_cliente requerido")

    with get_connection() as conn:
        ensure_orden_admision_transmision_column(conn)
        if payload.nb_cliente:
            cliente_exists = conn.execute(
                """
                SELECT 1 FROM clientes
                WHERE LOWER(nb_cliente) = LOWER(%s)
                  AND tel_cliente IS NOT DISTINCT FROM %s
                  AND email_cliente IS NOT DISTINCT FROM %s
                LIMIT 1
                """,
                (payload.nb_cliente, payload.tel_cliente, payload.email_cliente),
            ).fetchone()
            if not cliente_exists:
                conn.execute(
                    """
                    INSERT INTO clientes (nb_cliente, tel_cliente, email_cliente)
                    VALUES (%s, %s, %s)
                    """,
                    (payload.nb_cliente, payload.tel_cliente, payload.email_cliente),
                )

        conn.row_factory = dict_row
        row = conn.execute(
            """
            INSERT INTO orden_admision (
                reporte_siniestro,
                fecha_adm,
                hr_adm,
                nb_cliente,
                seguro_comp,
                tel_cliente,
                email_cliente,
                marca_vehiculo,
                tipo_vehiculo,
                modelo_anio,
                color_vehiculo,
                serie_auto,
                placas,
                kilometraje,
                transmision,
                danos_siniestro,
                danos_preexistentes,
            descripcion_siniestro,
            descripcion_danospreex
        )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, created_at
            """,
            (
                payload.reporte_siniestro,
                payload.fecha_adm,
                payload.hr_adm,
                payload.nb_cliente,
                payload.seguro_comp,
                payload.tel_cliente,
                payload.email_cliente,
                payload.marca_vehiculo,
                payload.tipo_vehiculo,
                payload.modelo_anio,
                payload.color_vehiculo,
                payload.serie_auto,
                payload.placas,
                payload.kilometraje,
                payload.transmision,
                payload.danos_siniestro,
                payload.danos_preexistentes,
                payload.descripcion_siniestro,
                payload.descripcion_danospreex,
            ),
        ).fetchone()

    return row


@router.put("/ordenes/{orden_id}")
def update_orden_admision(orden_id: int, payload: OrdenAdmisionUpdate):
    updates = {key: value for key, value in payload.model_dump().items() if value is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Sin cambios para actualizar")

    fields = ", ".join(f"{key} = %s" for key in updates.keys())
    values = list(updates.values()) + [orden_id]

    with get_connection() as conn:
        ensure_orden_admision_transmision_column(conn)
        row = conn.execute(
            f"""
            UPDATE orden_admision
            SET {fields}
            WHERE id = %s
            RETURNING id
            """,
            values,
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    return {"id": row[0]}


@router.delete("/ordenes/{orden_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_orden_admision(orden_id: int):
    media_root = Path(__file__).resolve().parent.parent.parent / "media" / "orden_admision" / str(orden_id)
    if media_root.exists():
        for item in media_root.iterdir():
            if item.is_file():
                item.unlink()
        media_root.rmdir()

    with get_connection() as conn:
        result = conn.execute("DELETE FROM orden_admision WHERE id = %s", (orden_id,))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    return None


@router.post("/ordenes/{orden_id}/archivo", status_code=status.HTTP_201_CREATED)
def upload_orden_archivo(orden_id: int, file: UploadFile = File(...)):
    extension = Path(file.filename or "").suffix.lower()
    if extension not in {".pdf", ".jpg", ".jpeg", ".png"}:
        raise HTTPException(status_code=400, detail="Formato inválido")

    media_root = Path(__file__).resolve().parent.parent.parent / "media" / "orden_admision" / str(orden_id)
    media_root.mkdir(parents=True, exist_ok=True)
    filename = f"orden_{uuid4().hex}{extension}"
    file_path = media_root / filename

    with file_path.open("wb") as buffer:
        buffer.write(file.file.read())

    file_size = file_path.stat().st_size

    relative_path = f"/media/orden_admision/{orden_id}/{filename}"

    with get_connection() as conn:
        conn.execute(
            """
            UPDATE orden_admision
            SET archivo_path = %s, archivo_nombre = %s, archivo_size = %s
            WHERE id = %s
            """,
            (relative_path, file.filename, file_size, orden_id),
        )

    return {"path": relative_path, "name": file.filename, "size": file_size}


@router.post("/ordenes/extract-fields")
def extract_orden_fields(file: UploadFile = File(...)):
    extension = Path(file.filename or "").suffix.lower()
    if extension not in _EXTRACTION_ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato inválido. Usa PDF, JPG, JPEG o PNG.",
        )

    file_bytes = file.file.read()
    if not file_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Archivo vacío.")

    try:
        textract_data = _extract_textract_data(file_bytes, extension)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudo extraer texto con Textract: {exc}",
        ) from exc

    ocr_text = textract_data.get("text", "")
    if not ocr_text.strip():
        return {
            "aseguradora_detectada": "",
            "template_detectado": "",
            "campos": {},
            "raw_text": "",
            "field_debug": {},
        }

    parsed, field_debug = _parse_orden_fields(
        ocr_text,
        textract_data.get("kv", {}),
        textract_data.get("lines", []),
        textract_data,
    )
    aseguradora = parsed.get("seguro_comp") or _detect_aseguradora(ocr_text)
    template = (aseguradora or "desconocido").lower()
    return {
        "aseguradora_detectada": aseguradora,
        "template_detectado": template,
        "campos": parsed,
        "raw_text": ocr_text[:12000],
        "field_debug": field_debug,
        "ocr_lines": textract_data.get("lines", [])[:200],
    }


class RecepcionCreate(BaseModel):
    folio_recep: Optional[str] = None
    fecha_recep: datetime
    nb_cliente: str
    tel_cliente: Optional[str] = None
    email_cliente: Optional[str] = None
    vehiculo: Optional[str] = None
    vehiculo_marca: Optional[str] = None
    vehiculo_modelo: Optional[str] = None
    vehiculo_anio: Optional[int] = None
    vehiculo_color: Optional[str] = None
    vehiculo_tipo: Optional[str] = None
    kilometraje: Optional[int] = None
    placas: Optional[str] = None
    seguro: Optional[str] = None
    fecha_entregaestim: Optional[datetime] = None
    estatus: str = "Recepcionado"
    nivel_gas: Optional[str] = None
    estado_mecanico: Optional[str] = None
    observaciones: Optional[str] = None
    partes_siniestro: Optional[list[str]] = None
    partes_preexistentes: Optional[list[str]] = None
    observaciones_siniestro: Optional[str] = None
    observaciones_preexistentes: Optional[str] = None
    fecha_seguro: Optional[datetime] = None
    folio_seguro: Optional[str] = None
    folio_ot: Optional[str] = None
    fecha_entrega: Optional[datetime] = None


class RecepcionUpdate(BaseModel):
    folio_recep: Optional[str] = None
    fecha_recep: Optional[datetime] = None
    nb_cliente: Optional[str] = None
    tel_cliente: Optional[str] = None
    email_cliente: Optional[str] = None
    vehiculo: Optional[str] = None
    vehiculo_marca: Optional[str] = None
    vehiculo_modelo: Optional[str] = None
    vehiculo_anio: Optional[int] = None
    vehiculo_color: Optional[str] = None
    vehiculo_tipo: Optional[str] = None
    kilometraje: Optional[int] = None
    placas: Optional[str] = None
    seguro: Optional[str] = None
    fecha_entregaestim: Optional[datetime] = None
    estatus: Optional[str] = None
    nivel_gas: Optional[str] = None
    estado_mecanico: Optional[str] = None
    observaciones: Optional[str] = None
    partes_siniestro: Optional[list[str]] = None
    partes_preexistentes: Optional[list[str]] = None
    observaciones_siniestro: Optional[str] = None
    observaciones_preexistentes: Optional[str] = None
    fecha_seguro: Optional[datetime] = None
    folio_seguro: Optional[str] = None
    folio_ot: Optional[str] = None
    fecha_entrega: Optional[datetime] = None


def _next_recepcion_folio(conn) -> str:
    row = conn.execute(
        """
        SELECT COALESCE(MAX(folio_recep::bigint), 4999) + 1 AS next_folio
        FROM recepciones
        WHERE folio_recep ~ '^[0-9]+$'
        """
    ).fetchone()
    next_folio = row[0] if row else 5000
    return str(next_folio)


@router.get("/registros/next-folio")
def get_next_folio():
    with get_connection() as conn:
        folio = _next_recepcion_folio(conn)
    return {"folio_recep": folio}


@router.get("/registros/{recepcion_id}")
def get_registro(recepcion_id: int):
    with get_connection() as conn:
        conn.row_factory = dict_row
        row = conn.execute(
            """
            SELECT
                id,
                folio_recep,
                fecha_recep,
                nb_cliente,
                tel_cliente,
                email_cliente,
                vehiculo,
                vehiculo_marca,
                vehiculo_modelo,
                vehiculo_anio,
                vehiculo_color,
                vehiculo_tipo,
                kilometraje,
                placas,
                seguro,
                fecha_entregaestim,
                estatus,
                nivel_gas,
                estado_mecanico,
                observaciones,
                partes_siniestro,
                partes_preexistentes,
                observaciones_siniestro,
                observaciones_preexistentes
            FROM recepciones
            WHERE id = %s
            LIMIT 1
            """,
            (recepcion_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro no encontrado")
    return row


@router.get("/registros/{recepcion_id}/pdf")
def download_registro_pdf(recepcion_id: int):
    app_root = Path(__file__).resolve().parent.parent.parent
    svg_template = app_root / "assets" / "Cardialog_svgLaMarina.svg"
    logo_path = app_root / "assets" / "LaMarinaCCLogoT.png"

    with get_connection() as conn:
        conn.row_factory = dict_row
        row = conn.execute(
            """
            SELECT
                id,
                folio_recep,
                fecha_recep,
                nb_cliente,
                tel_cliente,
                email_cliente,
                vehiculo_marca,
                vehiculo_modelo,
                vehiculo_anio,
                vehiculo_tipo,
                vehiculo_color,
                placas,
                kilometraje,
                seguro,
                fecha_entregaestim,
                estatus,
                nivel_gas,
                estado_mecanico,
                observaciones,
                partes_siniestro,
                partes_preexistentes,
                observaciones_siniestro,
                observaciones_preexistentes
            FROM recepciones
            WHERE id = %s
            LIMIT 1
            """,
            (recepcion_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro no encontrado")

        ensure_recepcion_media_table(conn)
        signature_row = conn.execute(
            """
            SELECT file_path
            FROM recepcion_media
            WHERE recepcion_id = %s AND media_type = 'signature'
            ORDER BY id DESC
            LIMIT 1
            """,
            (recepcion_id,),
        ).fetchone()
        signature_exists = signature_row is not None

    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    margin_x = 1.6 * cm
    y = height - 1.8 * cm

    # Font setup (Century Gothic if provided in assets, fallback to Helvetica).
    base_font = "Helvetica"
    bold_font = "Helvetica-Bold"
    for candidate in ("CenturyGothic.ttf", "centurygothic.ttf", "GOTHIC.TTF"):
        font_path = app_root / "assets" / candidate
        if font_path.exists():
            try:
                pdfmetrics.registerFont(TTFont("CenturyGothic", str(font_path)))
                # Same font for bold fallback if bold file is unavailable.
                pdfmetrics.registerFont(TTFont("CenturyGothic-Bold", str(font_path)))
                base_font = "CenturyGothic"
                bold_font = "CenturyGothic-Bold"
                break
            except Exception:
                pass

    # Header
    header_h = 2.6 * cm
    logo_w = 4.8 * cm
    logo_h = 2.8 * cm
    header_bottom = height - header_h

    pdf.setFillColor(colors.HexColor("#0f172a"))
    pdf.rect(0, header_bottom, width, header_h, fill=1, stroke=0)

    title_x = margin_x
    if logo_path.exists() and logo_path.is_file():
        try:
            logo_x = margin_x - 0.35 * cm
            logo_y = header_bottom + (header_h - logo_h) / 2
            pdf.drawImage(
                str(logo_path),
                logo_x,
                logo_y,
                width=logo_w,
                height=logo_h,
                preserveAspectRatio=True,
                mask="auto",
            )
            title_x = logo_x + logo_w + 0.9 * cm
        except Exception:
            pass

    pdf.setFillColor(colors.white)
    header_title = "LA MARINA COLLISION CENTER"
    header_title_size = 32
    max_header_title_w = width - title_x - margin_x
    while header_title_size > 18 and stringWidth(header_title, bold_font, header_title_size) > max_header_title_w:
        header_title_size -= 1
    pdf.setFont(bold_font, header_title_size)
    pdf.drawString(title_x, header_bottom + (header_h / 2) - 0.30 * cm, header_title)

    # Titulo principal fuera del header
    y = header_bottom - 0.75 * cm
    pdf.setFillColor(colors.HexColor("#111827"))
    pdf.setFont(bold_font, 20)
    pdf.drawCentredString(width / 2, y, "Comprobante de Recepción de Vehículo")
    y -= 0.65 * cm

    # Folio + fecha
    pdf.setFillColor(colors.HexColor("#111827"))
    pdf.setFont(bold_font, 11)
    pdf.drawString(margin_x, y, f"Folio: {_safe_pdf_text(row.get('folio_recep'))}")
    pdf.setFont(base_font, 10)
    fecha_recep = row.get("fecha_recep")
    fecha_text = (
        fecha_recep.strftime("%d/%m/%Y %H:%M") if hasattr(fecha_recep, "strftime") else _safe_pdf_text(fecha_recep)
    )
    pdf.drawRightString(width - margin_x, y, f"Fecha ingreso: {fecha_text}")
    y -= 1.0 * cm

    def draw_section_title(title: str):
        nonlocal y
        pdf.setFillColor(colors.HexColor("#0f766e"))
        pdf.setFont(bold_font, 11)
        pdf.drawString(margin_x, y, title.upper())
        y -= 0.25 * cm
        pdf.setStrokeColor(colors.HexColor("#2563eb"))
        pdf.line(margin_x, y, width - margin_x, y)
        y -= 0.45 * cm

    def draw_row(label: str, value: str, label_width: float = 4.8 * cm, max_width: float | None = None):
        nonlocal y
        pdf.setFillColor(colors.HexColor("#374151"))
        pdf.setFont(bold_font, 9)
        pdf.drawString(margin_x, y, f"{label}:")
        pdf.setFillColor(colors.black)
        row_width = max_width if max_width is not None else width - margin_x * 2 - label_width
        y = _draw_wrapped_text(
            pdf,
            value,
            margin_x + label_width,
            y,
            row_width,
            line_height=13,
            font_name=base_font,
            font_size=9,
        )
        y -= 4

    def draw_two_col_row(
        left_label: str,
        left_value: str,
        right_label: str,
        right_value: str,
        left_width_ratio: float = 0.52,
    ):
        nonlocal y
        available = width - (margin_x * 2)
        left_w = available * left_width_ratio
        right_w = available - left_w - (0.6 * cm)
        right_x = margin_x + left_w + (0.6 * cm)

        left_label_w = 3.2 * cm
        right_label_w = 3.2 * cm

        pdf.setFillColor(colors.HexColor("#374151"))
        pdf.setFont(bold_font, 9)
        pdf.drawString(margin_x, y, f"{left_label}:")
        pdf.drawString(right_x, y, f"{right_label}:")

        pdf.setFillColor(colors.black)
        y_left = _draw_wrapped_text(
            pdf,
            left_value,
            margin_x + left_label_w,
            y,
            left_w - left_label_w,
            line_height=13,
            font_name=base_font,
            font_size=9,
        )
        y_right = _draw_wrapped_text(
            pdf,
            right_value,
            right_x + right_label_w,
            y,
            right_w - right_label_w,
            line_height=13,
            font_name=base_font,
            font_size=9,
        )
        y = min(y_left, y_right) - 4

    # Cliente
    draw_section_title("Información del cliente")
    draw_two_col_row("Nombre", _safe_pdf_text(row.get("nb_cliente")), "Teléfono", _safe_pdf_text(row.get("tel_cliente")))
    draw_two_col_row("Correo", _safe_pdf_text(row.get("email_cliente")), "Aseguradora", _safe_pdf_text(row.get("seguro")))

    # Vehiculo
    draw_section_title("Detalles del vehículo")
    vehiculo = " ".join(
        [
            _safe_pdf_text(row.get("vehiculo_marca")) if row.get("vehiculo_marca") else "",
            _safe_pdf_text(row.get("vehiculo_modelo")) if row.get("vehiculo_modelo") else "",
            _safe_pdf_text(row.get("vehiculo_anio")) if row.get("vehiculo_anio") else "",
        ]
    ).strip() or "-"
    draw_two_col_row("Vehículo", vehiculo, "Tipo/Carrocería", _safe_pdf_text(row.get("vehiculo_tipo")))
    draw_two_col_row("Color", _safe_pdf_text(row.get("vehiculo_color")), "Placas", _safe_pdf_text(row.get("placas")))
    draw_two_col_row("Kilometraje", _safe_pdf_text(row.get("kilometraje")), "Nivel combustible", _safe_pdf_text(row.get("nivel_gas")))
    entrega = row.get("fecha_entregaestim")
    entrega_text = (
        entrega.strftime("%d/%m/%Y") if hasattr(entrega, "strftime") else _safe_pdf_text(entrega)
    )
    draw_two_col_row("Entrega estimada", entrega_text, "Estatus", _safe_pdf_text(row.get("estatus")))

    # Salt to new page if needed
    if y < 8 * cm:
        pdf.showPage()
        y = height - 2 * cm

    # Danos
    draw_section_title("Inspección de daños")
    siniestro = row.get("partes_siniestro") or []
    preexist = row.get("partes_preexistentes") or []
    draw_row(
        "Partes con daño (siniestro)",
        ", ".join(_pretty_part_name(item) for item in siniestro) if siniestro else "Sin partes seleccionadas",
    )
    draw_row(
        "Observaciones siniestro",
        _safe_pdf_text(row.get("observaciones_siniestro")),
    )
    draw_row(
        "Partes preexistentes",
        ", ".join(_pretty_part_name(item) for item in preexist) if preexist else "Sin partes seleccionadas",
    )
    draw_row(
        "Observaciones preexistentes",
        _safe_pdf_text(row.get("observaciones_preexistentes")),
    )
    draw_row("Estado mecánico e interiores", _safe_pdf_text(row.get("estado_mecanico")))
    draw_row("Observaciones adicionales", _safe_pdf_text(row.get("observaciones")))

    # Diagramas SVG con zonas seleccionadas
    if y < 10 * cm:
        pdf.showPage()
        y = height - 2 * cm
    draw_section_title("Diagrama de daños")
    block_height = 4.8 * cm
    block_width = (width - margin_x * 2 - 0.8 * cm) / 2
    left_x = margin_x
    right_x = margin_x + block_width + 0.8 * cm
    pdf.setFillColor(colors.HexColor("#374151"))
    pdf.setFont(bold_font, 9)
    pdf.drawCentredString(left_x + (block_width / 2), y, "Daños del siniestro")
    pdf.drawCentredString(right_x + (block_width / 2), y, "Daños preexistentes")
    y -= 0.35 * cm
    pdf.setStrokeColor(colors.HexColor("#d1d5db"))
    pdf.rect(left_x, y - block_height, block_width, block_height, stroke=1, fill=0)
    pdf.rect(right_x, y - block_height, block_width, block_height, stroke=1, fill=0)
    siniestro_svg = _build_colored_damage_svg(svg_template, row.get("partes_siniestro") or [], "#e04b4b")
    preexist_svg = _build_colored_damage_svg(svg_template, row.get("partes_preexistentes") or [], "#f2a300")
    _draw_svg_block(
        pdf,
        siniestro_svg,
        left_x + 0.15 * cm,
        y - block_height + 0.15 * cm,
        block_width - 0.3 * cm,
        block_height - 0.3 * cm,
    )
    _draw_svg_block(
        pdf,
        preexist_svg,
        right_x + 0.15 * cm,
        y - block_height + 0.15 * cm,
        block_width - 0.3 * cm,
        block_height - 0.3 * cm,
    )

    # Etiquetas de vista para ambos diagramas (sobrepuestas dentro del frame).
    frame_bottom_y = y - block_height
    label_y = frame_bottom_y + 0.22 * cm
    left_car_x = left_x + (block_width * 0.25)
    right_car_x = left_x + (block_width * 0.75)
    pre_left_car_x = right_x + (block_width * 0.25)
    pre_right_car_x = right_x + (block_width * 0.75)
    pdf.setFillColor(colors.HexColor("#374151"))
    pdf.setFont(bold_font, 7)
    pdf.drawCentredString(left_car_x, label_y, "Lado izquierdo")
    pdf.drawCentredString(right_car_x, label_y, "Lado derecho")
    pdf.drawCentredString(pre_left_car_x, label_y, "Lado izquierdo")
    pdf.drawCentredString(pre_right_car_x, label_y, "Lado derecho")

    y -= block_height + 0.6 * cm

    # Bloque de firma sin separador de "Formalizacion":
    # una sola línea para firma, imagen sobrepuesta y nombre del cliente debajo.
    sign_line_w = 8.6 * cm
    sign_center_x = margin_x + ((width - (margin_x * 2)) / 2)
    note_y = 1.9 * cm
    line_y = note_y + 2.1 * cm
    line_x1 = sign_center_x - (sign_line_w / 2)
    line_x2 = sign_center_x + (sign_line_w / 2)

    if signature_exists and signature_row and signature_row.get("file_path"):
        signature_path = app_root / str(signature_row.get("file_path")).lstrip("/")
        if signature_path.exists() and signature_path.is_file():
            try:
                sign_w = 8.2 * cm
                sign_h = 3.0 * cm
                sign_x = sign_center_x - (sign_w / 2)
                sign_y = line_y - (sign_h * 0.22)
                sig_source = _prepare_signature_black(signature_path)
                pdf.drawImage(
                    sig_source,
                    sign_x,
                    sign_y,
                    width=sign_w,
                    height=sign_h,
                    preserveAspectRatio=True,
                    anchor="n",
                    mask="auto",
                )
            except Exception:
                pass

    pdf.setStrokeColor(colors.HexColor("#374151"))
    pdf.setLineWidth(1)
    pdf.line(line_x1, line_y, line_x2, line_y)

    pdf.setFillColor(colors.HexColor("#111827"))
    pdf.setFont(base_font, 9)
    pdf.drawCentredString(sign_center_x, line_y - 0.45 * cm, _safe_pdf_text(row.get("nb_cliente")))
    y = line_y - 1.0 * cm

    # Nota legal inferior (centrada)
    pdf.setFillColor(colors.HexColor("#0f172a"))
    # Bold + italic for legal notice.
    note_font = "Helvetica-BoldOblique"
    note_font_size = 7
    pdf.setFont(note_font, note_font_size)
    note_text = "NOTA: NO NOS HACEMOS RESPONSABLES POR OBJETOS DE VALOR OLVIDADOS EN EL INTERIOR DE SU VEHICULO"
    max_note_width = width - (margin_x * 2)
    safe_note_text = _fit_text_single_line(note_text, max_note_width, note_font, note_font_size)
    pdf.drawCentredString(
        width / 2,
        note_y,
        safe_note_text,
    )

    pdf.setFillColor(colors.HexColor("#6b7280"))
    footer_font_size = 8
    pdf.setFont(base_font, footer_font_size)
    footer_text = "La Marina Collision Center - Circunvalación Playas #31 El Toreo 82120 Mazatlán, Sinaloa"
    safe_footer_text = _fit_text_single_line(
        footer_text,
        width - (margin_x * 2),
        base_font,
        footer_font_size,
    )
    pdf.drawCentredString(
        width / 2,
        1.1 * cm,
        safe_footer_text,
    )

    pdf.save()
    buffer.seek(0)
    filename = f"Recepcion_{_safe_pdf_text(row.get('folio_recep')).replace(' ', '_')}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/registros", status_code=status.HTTP_201_CREATED)
def create_registro(payload: RecepcionCreate):
    if not payload.nb_cliente.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="nb_cliente requerido")

    with get_connection() as conn:
        with conn.transaction():
            conn.execute("LOCK TABLE recepciones IN EXCLUSIVE MODE")
            generated_folio = _next_recepcion_folio(conn)

            if payload.nb_cliente:
                cliente = conn.execute(
                    """
                    SELECT 1 FROM clientes
                    WHERE LOWER(nb_cliente) = LOWER(%s)
                      AND tel_cliente IS NOT DISTINCT FROM %s
                      AND email_cliente IS NOT DISTINCT FROM %s
                    LIMIT 1
                    """,
                    (payload.nb_cliente, payload.tel_cliente, payload.email_cliente),
                ).fetchone()
                if not cliente:
                    conn.execute(
                        """
                        INSERT INTO clientes (nb_cliente, tel_cliente, email_cliente)
                        VALUES (%s, %s, %s)
                        """,
                        (payload.nb_cliente, payload.tel_cliente, payload.email_cliente),
                    )

            duplicate = conn.execute(
                """
                SELECT 1
                FROM historical_entries
                WHERE DATE(fecha_recep) = DATE(%s) AND placas = %s
                LIMIT 1
                """,
                (payload.fecha_recep, payload.placas),
            ).fetchone()
            if duplicate:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Recepción duplicada")

            row = conn.execute(
                """
                INSERT INTO recepciones (
                    folio_recep,
                    fecha_recep,
                    nb_cliente,
                    tel_cliente,
                    email_cliente,
                    vehiculo,
                    vehiculo_marca,
                    vehiculo_modelo,
                    vehiculo_anio,
                    vehiculo_color,
                    vehiculo_tipo,
                    kilometraje,
                    placas,
                    seguro,
                    fecha_entregaestim,
                    estatus,
                    nivel_gas,
                    estado_mecanico,
                    observaciones,
                    partes_siniestro,
                    partes_preexistentes,
                    observaciones_siniestro,
                    observaciones_preexistentes
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    generated_folio,
                    payload.fecha_recep,
                    payload.nb_cliente,
                    payload.tel_cliente,
                    payload.email_cliente,
                    payload.vehiculo,
                    payload.vehiculo_marca,
                    payload.vehiculo_modelo,
                    payload.vehiculo_anio,
                    payload.vehiculo_color,
                    payload.vehiculo_tipo,
                    payload.kilometraje,
                    payload.placas,
                    payload.seguro,
                    payload.fecha_entregaestim,
                    payload.estatus,
                    payload.nivel_gas,
                    payload.estado_mecanico,
                    payload.observaciones,
                    payload.partes_siniestro,
                    payload.partes_preexistentes,
                    payload.observaciones_siniestro,
                    payload.observaciones_preexistentes,
                ),
            ).fetchone()

            conn.execute(
                """
                INSERT INTO historical_entries (
                    fecha_seguro,
                    fecha_recep,
                    folio_seguro,
                    folio_recep,
                    folio_ot,
                    nb_cliente,
                    tel_cliente,
                    seguro,
                    marca_vehiculo,
                    modelo_vehiculo,
                    tipo_carroceria,
                    color,
                    placas,
                    kilometraje,
                    nivel_gas,
                    estado_mecanico,
                    observaciones,
                    fecha_entregaestim,
                    estatus,
                    fecha_entrega
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    payload.fecha_seguro,
                    payload.fecha_recep,
                    payload.folio_seguro,
                    generated_folio,
                    payload.folio_ot,
                    payload.nb_cliente,
                    payload.tel_cliente,
                    payload.seguro,
                    payload.vehiculo_marca,
                    payload.vehiculo_modelo,
                    payload.vehiculo_tipo,
                    payload.vehiculo_color,
                    payload.placas,
                    payload.kilometraje,
                    payload.nivel_gas,
                    payload.estado_mecanico,
                    payload.observaciones,
                    payload.fecha_entregaestim,
                    payload.estatus,
                    payload.fecha_entrega,
                ),
            )

    return {"id": row[0], "folio_recep": generated_folio}


@router.put("/registros/{recepcion_id}")
def update_registro(recepcion_id: int, payload: RecepcionUpdate):
    allowed_fields = {
        "fecha_recep",
        "nb_cliente",
        "tel_cliente",
        "email_cliente",
        "vehiculo",
        "vehiculo_marca",
        "vehiculo_modelo",
        "vehiculo_anio",
        "vehiculo_color",
        "vehiculo_tipo",
        "kilometraje",
        "placas",
        "seguro",
        "fecha_entregaestim",
        "estatus",
        "nivel_gas",
        "estado_mecanico",
        "observaciones",
        "partes_siniestro",
        "partes_preexistentes",
        "observaciones_siniestro",
        "observaciones_preexistentes",
    }
    updates = {
        key: value
        for key, value in payload.model_dump().items()
        if value is not None and key in allowed_fields
    }
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sin cambios para actualizar")

    with get_connection() as conn:
        conn.row_factory = dict_row
        current = conn.execute(
            "SELECT id, folio_recep FROM recepciones WHERE id = %s",
            (recepcion_id,),
        ).fetchone()
        if not current:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro no encontrado")

        if "nb_cliente" in updates and updates.get("nb_cliente"):
            tel = updates.get("tel_cliente")
            email = updates.get("email_cliente")
            cliente = conn.execute(
                """
                SELECT 1 FROM clientes
                WHERE LOWER(nb_cliente) = LOWER(%s)
                  AND tel_cliente IS NOT DISTINCT FROM %s
                  AND email_cliente IS NOT DISTINCT FROM %s
                LIMIT 1
                """,
                (updates["nb_cliente"], tel, email),
            ).fetchone()
            if not cliente:
                conn.execute(
                    "INSERT INTO clientes (nb_cliente, tel_cliente, email_cliente) VALUES (%s, %s, %s)",
                    (updates["nb_cliente"], tel, email),
                )

        set_clause = ", ".join(f"{field} = %s" for field in updates.keys())
        values = list(updates.values()) + [recepcion_id]
        conn.execute(
            f"UPDATE recepciones SET {set_clause} WHERE id = %s",
            values,
        )

        updated = conn.execute(
            """
            SELECT
                folio_recep, fecha_recep, nb_cliente, tel_cliente, seguro,
                vehiculo_marca, vehiculo_modelo, vehiculo_tipo, vehiculo_color,
                placas, kilometraje, nivel_gas, estado_mecanico, observaciones,
                fecha_entregaestim, estatus
            FROM recepciones
            WHERE id = %s
            """,
            (recepcion_id,),
        ).fetchone()

        conn.execute(
            """
            UPDATE historical_entries
            SET
                fecha_recep = %s,
                folio_recep = %s,
                nb_cliente = %s,
                tel_cliente = %s,
                seguro = %s,
                marca_vehiculo = %s,
                modelo_vehiculo = %s,
                tipo_carroceria = %s,
                color = %s,
                placas = %s,
                kilometraje = %s,
                nivel_gas = %s,
                estado_mecanico = %s,
                observaciones = %s,
                fecha_entregaestim = %s,
                estatus = %s
            WHERE folio_recep = %s
            """,
            (
                updated.get("fecha_recep"),
                updated.get("folio_recep"),
                updated.get("nb_cliente"),
                updated.get("tel_cliente"),
                updated.get("seguro"),
                updated.get("vehiculo_marca"),
                updated.get("vehiculo_modelo"),
                updated.get("vehiculo_tipo"),
                updated.get("vehiculo_color"),
                updated.get("placas"),
                updated.get("kilometraje"),
                updated.get("nivel_gas"),
                updated.get("estado_mecanico"),
                updated.get("observaciones"),
                updated.get("fecha_entregaestim"),
                updated.get("estatus"),
                current.get("folio_recep"),
            ),
        )

    return {"id": recepcion_id}


@router.post("/registros/{recepcion_id}/media", status_code=status.HTTP_201_CREATED)
def upload_media(recepcion_id: int, media_type: str, file: UploadFile = File(...)):
    if media_type not in {
        "photo",
        "video",
        "signature",
        "photo_damage_right",
        "photo_damage_left",
        "photo_preexist_right",
        "photo_preexist_left",
        "drawing_damage_siniestro",
        "drawing_damage_preexistente",
    }:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="media_type inválido")

    media_root = Path(__file__).resolve().parent.parent.parent / "media" / "recepcion" / str(recepcion_id)
    media_root.mkdir(parents=True, exist_ok=True)

    extension = Path(file.filename or "").suffix.lower()
    filename = f"{media_type}_{uuid4().hex}{extension}"
    file_path = media_root / filename

    with file_path.open("wb") as buffer:
        buffer.write(file.file.read())

    relative_path = f"/media/recepcion/{recepcion_id}/{filename}"

    with get_connection() as conn:
        ensure_recepcion_media_table(conn)
        single_asset_types = {
            "video",
            "signature",
            "drawing_damage_siniestro",
            "drawing_damage_preexistente",
        }
        if media_type in single_asset_types:
            conn.row_factory = dict_row
            old_rows = conn.execute(
                """
                SELECT file_path
                FROM recepcion_media
                WHERE recepcion_id = %s AND media_type = %s
                """,
                (recepcion_id, media_type),
            ).fetchall()
            conn.execute(
                """
                DELETE FROM recepcion_media
                WHERE recepcion_id = %s AND media_type = %s
                """,
                (recepcion_id, media_type),
            )
            app_root = Path(__file__).resolve().parent.parent.parent
            for row in old_rows:
                old_file = app_root / str(row.get("file_path") or "").lstrip("/")
                if old_file.exists() and old_file.is_file():
                    try:
                        old_file.unlink()
                    except Exception:
                        pass
        conn.execute(
            """
            INSERT INTO recepcion_media (recepcion_id, media_type, file_path, original_name)
            VALUES (%s, %s, %s, %s)
            """,
            (recepcion_id, media_type, relative_path, file.filename),
        )

    return {"path": relative_path}


@router.get("/registros/{recepcion_id}/media")
def list_media(recepcion_id: int, media_type: Optional[str] = None):
    with get_connection() as conn:
        ensure_recepcion_media_table(conn)
        conn.row_factory = dict_row
        if media_type:
            rows = conn.execute(
                """
                SELECT id, media_type, file_path, original_name, created_at
                FROM recepcion_media
                WHERE recepcion_id = %s AND media_type = %s
                ORDER BY id ASC
                """,
                (recepcion_id, media_type),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, media_type, file_path, original_name, created_at
                FROM recepcion_media
                WHERE recepcion_id = %s
                ORDER BY id ASC
                """,
                (recepcion_id,),
            ).fetchall()

    return rows


@router.get("/registros/{recepcion_id}/media/download")
def download_media_zip(recepcion_id: int):
    def _normalize_token(value: Optional[str], fallback: str = "NA") -> str:
        raw = (value or "").strip()
        if not raw:
            return fallback
        token = re.sub(r"\s+", "-", raw)
        token = re.sub(r"[^A-Za-z0-9_-]", "", token)
        return token or fallback

    type_suffix = {
        "photo_damage_right": "siniestro_der",
        "photo_damage_left": "siniestro_izq",
        "photo_preexist_right": "preexistente_der",
        "photo_preexist_left": "preexistente_izq",
        "photo": "foto",
        "signature": "firma_cliente",
    }

    with get_connection() as conn:
        ensure_recepcion_media_table(conn)
        conn.row_factory = dict_row
        recepcion = conn.execute(
            """
            SELECT folio_recep, vehiculo_marca, vehiculo_tipo, vehiculo_anio
            FROM recepciones
            WHERE id = %s
            LIMIT 1
            """,
            (recepcion_id,),
        ).fetchone()
        if not recepcion:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro no encontrado")

        rows = conn.execute(
            """
            SELECT id, media_type, file_path, original_name
            FROM recepcion_media
            WHERE recepcion_id = %s
              AND (media_type LIKE 'photo%%' OR media_type = 'signature')
            ORDER BY id ASC
            """,
            (recepcion_id,),
        ).fetchall()

    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No hay imágenes para descargar")

    app_root = Path(__file__).resolve().parent.parent.parent
    buffer = BytesIO()
    added = 0
    type_counters: dict[str, int] = {}
    with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as zip_file:
        for row in rows:
            relative_path = (row.get("file_path") or "").strip()
            if not relative_path:
                continue
            disk_path = app_root / relative_path.lstrip("/")
            if not disk_path.exists() or not disk_path.is_file():
                continue
            media_type = row.get("media_type") or "photo"
            suffix = type_suffix.get(media_type, "foto")
            type_counters[suffix] = type_counters.get(suffix, 0) + 1
            extension = Path(row.get("original_name") or "").suffix.lower() or disk_path.suffix.lower() or ".jpg"
            safe_name = f"{type_counters[suffix]}_{suffix}{extension}"
            zip_file.write(disk_path, arcname=safe_name)
            added += 1

    if added == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontraron archivos físicos para comprimir")

    buffer.seek(0)
    filename = (
        f"Galeria_"
        f"{_normalize_token(str(recepcion.get('folio_recep') or recepcion_id))}_"
        f"{_normalize_token(recepcion.get('vehiculo_marca'))}_"
        f"{_normalize_token(recepcion.get('vehiculo_tipo'))}_"
        f"{_normalize_token(str(recepcion.get('vehiculo_anio') or 'NA'))}.zip"
    )
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/registros/{recepcion_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_registro(recepcion_id: int):
    with get_connection() as conn:
        conn.row_factory = dict_row
        ensure_recepcion_media_table(conn)
        registro = conn.execute(
            "SELECT id, folio_recep FROM recepciones WHERE id = %s",
            (recepcion_id,),
        ).fetchone()
        if not registro:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro no encontrado")

        media_rows = conn.execute(
            "SELECT file_path FROM recepcion_media WHERE recepcion_id = %s",
            (recepcion_id,),
        ).fetchall()

        conn.execute("DELETE FROM recepcion_media WHERE recepcion_id = %s", (recepcion_id,))
        conn.execute("DELETE FROM recepciones WHERE id = %s", (recepcion_id,))
        conn.execute(
            "DELETE FROM historical_entries WHERE folio_recep = %s",
            (registro.get("folio_recep"),),
        )

    app_root = Path(__file__).resolve().parent.parent.parent
    for row in media_rows:
        file_path = (row.get("file_path") or "").strip()
        if not file_path:
            continue
        disk_path = app_root / file_path.lstrip("/")
        try:
            if disk_path.exists():
                disk_path.unlink()
        except OSError:
            # Si no se puede eliminar el archivo físico, no bloqueamos el borrado del registro.
            pass

    media_folder = Path(__file__).resolve().parent.parent.parent / "media" / "recepcion" / str(recepcion_id)
    try:
        if media_folder.exists():
            for child in media_folder.iterdir():
                if child.is_file():
                    child.unlink(missing_ok=True)
            media_folder.rmdir()
    except OSError:
        pass
