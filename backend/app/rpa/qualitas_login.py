import argparse
import asyncio
import os
import time
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv
from playwright.async_api import TimeoutError as PlaywrightTimeoutError
from playwright.async_api import async_playwright


@dataclass
class QualitasRpaConfig:
    login_url: str
    user: str
    password: str
    taller_id: str
    email_selector: str
    password_selector: str
    taller_id_selector: str
    terms_selector: str
    recaptcha_iframe_selector: str
    recaptcha_anchor_selector: str
    recaptcha_timeout_ms: int
    login_button_selector: str
    post_login_wait_selector: str
    headless: bool
    slow_mo_ms: int


def load_config() -> QualitasRpaConfig:
    backend_dir = Path(__file__).resolve().parents[2]
    env_qualitas = backend_dir / ".envQualitas"
    env_default = backend_dir / ".env"

    if env_qualitas.exists():
        load_dotenv(dotenv_path=env_qualitas)
    else:
        load_dotenv(dotenv_path=env_default)

    return QualitasRpaConfig(
        login_url=os.getenv("QUALITAS_LOGIN_URL", "").strip(),
        user=os.getenv("QUALITAS_USER", "").strip(),
        password=os.getenv("QUALITAS_PASSWORD", "").strip(),
        taller_id=os.getenv("QUALITAS_TALLER_ID", "").strip(),
        email_selector=os.getenv("QUALITAS_EMAIL_SELECTOR", 'input[placeholder="Email"]').strip(),
        password_selector=os.getenv("QUALITAS_PASSWORD_SELECTOR", 'input[placeholder="Password"]').strip(),
        taller_id_selector=os.getenv("QUALITAS_TALLER_ID_SELECTOR", 'input[placeholder="ID-Taller"]').strip(),
        terms_selector=os.getenv(
            "QUALITAS_TERMS_SELECTOR",
            'input[type="checkbox"][name="tyc"][value="1"]',
        ).strip(),
        recaptcha_iframe_selector=os.getenv(
            "QUALITAS_RECAPTCHA_IFRAME_SELECTOR",
            'iframe[title*="reCAPTCHA"]',
        ).strip(),
        recaptcha_anchor_selector=os.getenv(
            "QUALITAS_RECAPTCHA_ANCHOR_SELECTOR",
            "#recaptcha-anchor",
        ).strip(),
        recaptcha_timeout_ms=int(os.getenv("QUALITAS_RECAPTCHA_TIMEOUT_MS", "180000")),
        login_button_selector=os.getenv(
            "QUALITAS_LOGIN_BUTTON_SELECTOR",
            'input[type="submit"][value="Log In"]',
        ).strip(),
        post_login_wait_selector=os.getenv("QUALITAS_POST_LOGIN_SELECTOR", "").strip(),
        headless=os.getenv("QUALITAS_HEADLESS", "false").strip().lower() == "true",
        slow_mo_ms=int(os.getenv("QUALITAS_SLOWMO_MS", "60")),
    )


def validate_config(config: QualitasRpaConfig) -> None:
    missing_vars = []
    if not config.login_url:
        missing_vars.append("QUALITAS_LOGIN_URL")
    if not config.user:
        missing_vars.append("QUALITAS_USER")
    if not config.password:
        missing_vars.append("QUALITAS_PASSWORD")
    if not config.taller_id:
        missing_vars.append("QUALITAS_TALLER_ID")

    if missing_vars:
        raise ValueError(
            f"Faltan variables obligatorias en .env: {', '.join(missing_vars)}"
        )


async def run_login(config: QualitasRpaConfig, session_path: Path) -> None:
    session_path.parent.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            headless=config.headless,
            slow_mo=config.slow_mo_ms if not config.headless else 0,
        )
        context = await browser.new_context()
        page = await context.new_page()

        try:
            await page.goto(config.login_url, wait_until="domcontentloaded")

            await page.fill(config.email_selector, config.user)
            await page.fill(config.password_selector, config.password)
            await page.fill(config.taller_id_selector, config.taller_id)

            if config.terms_selector:
                terms_checkbox = page.locator(config.terms_selector).first
                if not await terms_checkbox.is_checked():
                    await terms_checkbox.check()

            print("ReCAPTCHA requiere intervención humana.")
            print("Haz clic manual en 'No soy un robot'. Esperando validación...")
            recaptcha_anchor = (
                page.frame_locator(config.recaptcha_iframe_selector)
                .locator(config.recaptcha_anchor_selector)
                .first
            )
            await recaptcha_anchor.wait_for(state="visible", timeout=config.recaptcha_timeout_ms)
            deadline = time.monotonic() + (config.recaptcha_timeout_ms / 1000)
            while time.monotonic() < deadline:
                if await recaptcha_anchor.get_attribute("aria-checked") == "true":
                    break
                await asyncio.sleep(0.5)
            else:
                raise RuntimeError(
                    "No se validó reCAPTCHA dentro del tiempo configurado."
                )

            await page.click(config.login_button_selector)

            if config.post_login_wait_selector:
                await page.wait_for_selector(config.post_login_wait_selector, timeout=30000)
            else:
                await page.wait_for_load_state("networkidle", timeout=30000)

            await context.storage_state(path=str(session_path))
            print(f"Sesión guardada en: {session_path}")

        except PlaywrightTimeoutError as exc:
            raise RuntimeError(
                "Timeout en login. Revisa selectores o flujo posterior al botón LOG IN."
            ) from exc
        finally:
            await context.close()
            await browser.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="RPA base para login de Qualitas (con paso manual de reCAPTCHA)."
    )
    parser.add_argument(
        "--session-path",
        default=str(Path(__file__).resolve().parent / "sessions" / "qualitas_session.json"),
        help="Ruta para guardar el storage state de la sesión.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = load_config()
    validate_config(config)
    asyncio.run(run_login(config=config, session_path=Path(args.session_path)))


if __name__ == "__main__":
    main()
