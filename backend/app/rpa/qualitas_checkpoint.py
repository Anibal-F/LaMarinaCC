"""
Sistema de checkpoints para el RPA de Qualitas Piezas.

Guarda el progreso de extracción para poder reanudar desde donde se quedó
si el proceso se interrumpe o falla.
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Set


class QualitasCheckpoint:
    """Gestiona el estado de progreso del extractor de piezas."""
    
    def __init__(self, checkpoint_dir: str = "/app/app/rpa/data/checkpoints"):
        self.checkpoint_dir = Path(checkpoint_dir)
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
        self.checkpoint_file = self.checkpoint_dir / "piezas_checkpoint.json"
        
    def load(self) -> Dict:
        """Carga el estado del checkpoint si existe."""
        if self.checkpoint_file.exists():
            try:
                with open(self.checkpoint_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    print(f"[Checkpoint] Estado cargado: {len(data.get('ordenes_procesadas', []))} órdenes ya procesadas")
                    return data
            except Exception as e:
                print(f"[Checkpoint] Error cargando estado: {e}")
                return self._create_empty()
        return self._create_empty()
    
    def save(self, data: Dict):
        """Guarda el estado actual del checkpoint."""
        try:
            data['last_update'] = datetime.now().isoformat()
            with open(self.checkpoint_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"[Checkpoint] Error guardando estado: {e}")
    
    def _create_empty(self) -> Dict:
        """Crea un estado vacío."""
        return {
            'ordenes_procesadas': [],  # Lista de num_expediente ya procesados (global)
            'ordenes_fallidas': [],     # Lista de órdenes que fallaron
            'total_ordenes': 0,         # Total de órdenes encontradas (legacy)
            'pagina_actual': 1,         # Última página procesada (legacy)
            'session_id': None,         # ID de sesión para evitar duplicados
            'started_at': datetime.now().isoformat(),
            'last_update': datetime.now().isoformat(),
            # Nuevos campos para múltiples tabs
            'tabs': {
                'transito': {
                    'ordenes_procesadas': [],
                    'total_ordenes': 0,
                    'pagina_actual': 1,
                    'completado': False
                },
                'piso': {
                    'ordenes_procesadas': [],
                    'total_ordenes': 0,
                    'pagina_actual': 1,
                    'completado': False
                }
            },
            'tab_actual': None  # 'transito', 'piso', o None
        }
    
    def mark_orden_procesada(self, num_expediente: str, piezas_count: int = 0, tab_name: str = None):
        """Marca una orden como procesada exitosamente."""
        data = self.load()
        
        # Siempre agregar a la lista global para compatibilidad
        if num_expediente not in data['ordenes_procesadas']:
            data['ordenes_procesadas'].append(num_expediente)
            print(f"[Checkpoint] Orden {num_expediente} marcada como procesada ({piezas_count} piezas)")
        
        # Si se especifica un tab, también guardar en el tab específico
        if tab_name and tab_name in data.get('tabs', {}):
            if num_expediente not in data['tabs'][tab_name]['ordenes_procesadas']:
                data['tabs'][tab_name]['ordenes_procesadas'].append(num_expediente)
                data['tab_actual'] = tab_name
        
        self.save(data)
    
    def mark_orden_fallida(self, num_expediente: str, error: str = "", tab_name: str = None):
        """Marca una orden como fallida."""
        data = self.load()
        
        # Evitar duplicados en la lista global
        ordenes_fallidas = {o['num_expediente'] for o in data['ordenes_fallidas']}
        if num_expediente not in ordenes_fallidas:
            fallida = {
                'num_expediente': num_expediente,
                'error': error,
                'timestamp': datetime.now().isoformat()
            }
            if tab_name:
                fallida['tab'] = tab_name
            data['ordenes_fallidas'].append(fallida)
            print(f"[Checkpoint] Orden {num_expediente} marcada como fallida: {error}")
        
        # Si se especifica un tab, también guardar en el tab específico
        if tab_name and tab_name in data.get('tabs', {}):
            if num_expediente not in data['tabs'][tab_name].get('ordenes_fallidas', []):
                if 'ordenes_fallidas' not in data['tabs'][tab_name]:
                    data['tabs'][tab_name]['ordenes_fallidas'] = []
                data['tabs'][tab_name]['ordenes_fallidas'].append(num_expediente)
        
        self.save(data)
    
    def is_orden_procesada(self, num_expediente: str) -> bool:
        """Verifica si una orden ya fue procesada."""
        data = self.load()
        return num_expediente in data['ordenes_procesadas']
    
    def get_ordenes_procesadas(self) -> Set[str]:
        """Retorna el set de órdenes ya procesadas."""
        data = self.load()
        return set(data['ordenes_procesadas'])
    
    def get_ordenes_fallidas(self) -> List[Dict]:
        """Retorna la lista de órdenes que fallaron."""
        data = self.load()
        return data['ordenes_fallidas']
    
    def update_pagina(self, pagina: int, tab_name: str = None):
        """Actualiza la página actual."""
        data = self.load()
        data['pagina_actual'] = pagina  # Legacy
        
        # Si se especifica un tab, actualizar en el tab específico
        if tab_name and tab_name in data.get('tabs', {}):
            data['tabs'][tab_name]['pagina_actual'] = pagina
            data['tab_actual'] = tab_name
        
        self.save(data)
    
    def update_total_ordenes(self, total: int, tab_name: str = None):
        """Actualiza el total de órdenes encontradas."""
        data = self.load()
        data['total_ordenes'] = total  # Legacy
        
        # Si se especifica un tab, actualizar en el tab específico
        if tab_name and tab_name in data.get('tabs', {}):
            data['tabs'][tab_name]['total_ordenes'] = total
        
        self.save(data)
    
    def reset(self):
        """Reinicia el checkpoint (para empezar desde cero)."""
        if self.checkpoint_file.exists():
            backup_file = self.checkpoint_dir / f"piezas_checkpoint_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            try:
                self.checkpoint_file.rename(backup_file)
                print(f"[Checkpoint] Backup creado: {backup_file}")
            except Exception as e:
                print(f"[Checkpoint] Error creando backup: {e}")
        
        empty = self._create_empty()
        self.save(empty)
        print("[Checkpoint] Estado reiniciado")
    
    def get_stats(self) -> Dict:
        """Retorna estadísticas del checkpoint."""
        data = self.load()
        total_legacy = data['total_ordenes']
        
        # Calcular totales de tabs
        tabs_stats = {}
        total_tabs = 0
        procesadas_tabs = 0
        for tab_name, tab_data in data.get('tabs', {}).items():
            tab_procesadas = len(tab_data.get('ordenes_procesadas', []))
            tab_total = tab_data.get('total_ordenes', 0)
            tabs_stats[tab_name] = {
                'procesadas': tab_procesadas,
                'total': tab_total,
                'completado': tab_data.get('completado', False)
            }
            total_tabs += tab_total
            procesadas_tabs += tab_procesadas
        
        return {
            'procesadas': len(data['ordenes_procesadas']),
            'fallidas': len(data['ordenes_fallidas']),
            'total': total_legacy,
            'progreso': f"{len(data['ordenes_procesadas'])}/{total_legacy}" if total_legacy > 0 else "N/A",
            'porcentaje': round(len(data['ordenes_procesadas']) / total_legacy * 100, 1) if total_legacy > 0 else 0,
            'pagina_actual': data['pagina_actual'],
            'last_update': data['last_update'],
            'tabs': tabs_stats,
            'total_tabs': total_tabs,
            'procesadas_tabs': procesadas_tabs
        }
    
    def should_retry_orden(self, num_expediente: str, max_retries: int = 3) -> bool:
        """Verifica si una orden fallida debe reintentarse."""
        data = self.load()
        
        fallos = [o for o in data['ordenes_fallidas'] if o['num_expediente'] == num_expediente]
        return len(fallos) < max_retries
    
    def mark_tab_completado(self, tab_name: str):
        """Marca un tab como completado."""
        data = self.load()
        if tab_name in data.get('tabs', {}):
            data['tabs'][tab_name]['completado'] = True
            self.save(data)
            print(f"[Checkpoint] Tab '{tab_name}' marcado como completado")
    
    def is_tab_completado(self, tab_name: str) -> bool:
        """Verifica si un tab ya fue completado."""
        data = self.load()
        return data.get('tabs', {}).get(tab_name, {}).get('completado', False)
    
    def get_tab_stats(self, tab_name: str) -> Dict:
        """Retorna estadísticas de un tab específico."""
        data = self.load()
        tab_data = data.get('tabs', {}).get(tab_name, {})
        total = tab_data.get('total_ordenes', 0)
        procesadas = len(tab_data.get('ordenes_procesadas', []))
        return {
            'procesadas': procesadas,
            'total': total,
            'completado': tab_data.get('completado', False),
            'pagina_actual': tab_data.get('pagina_actual', 1),
            'progreso': f"{procesadas}/{total}" if total > 0 else "N/A",
            'porcentaje': round(procesadas / total * 100, 1) if total > 0 else 0
        }


# Instancia global
checkpoint = QualitasCheckpoint()
