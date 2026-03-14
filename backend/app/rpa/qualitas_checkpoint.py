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
            'ordenes_procesadas': [],  # Lista de num_expediente ya procesados
            'ordenes_fallidas': [],     # Lista de órdenes que fallaron
            'total_ordenes': 0,         # Total de órdenes encontradas
            'pagina_actual': 1,         # Última página procesada
            'session_id': None,         # ID de sesión para evitar duplicados
            'started_at': datetime.now().isoformat(),
            'last_update': datetime.now().isoformat()
        }
    
    def mark_orden_procesada(self, num_expediente: str, piezas_count: int = 0):
        """Marca una orden como procesada exitosamente."""
        data = self.load()
        
        if num_expediente not in data['ordenes_procesadas']:
            data['ordenes_procesadas'].append(num_expediente)
            print(f"[Checkpoint] Orden {num_expediente} marcada como procesada ({piezas_count} piezas)")
        
        self.save(data)
    
    def mark_orden_fallida(self, num_expediente: str, error: str = ""):
        """Marca una orden como fallida."""
        data = self.load()
        
        # Evitar duplicados
        ordenes_fallidas = {o['num_expediente'] for o in data['ordenes_fallidas']}
        if num_expediente not in ordenes_fallidas:
            data['ordenes_fallidas'].append({
                'num_expediente': num_expediente,
                'error': error,
                'timestamp': datetime.now().isoformat()
            })
            print(f"[Checkpoint] Orden {num_expediente} marcada como fallida: {error}")
        
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
    
    def update_pagina(self, pagina: int):
        """Actualiza la página actual."""
        data = self.load()
        data['pagina_actual'] = pagina
        self.save(data)
    
    def update_total_ordenes(self, total: int):
        """Actualiza el total de órdenes encontradas."""
        data = self.load()
        data['total_ordenes'] = total
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
        return {
            'procesadas': len(data['ordenes_procesadas']),
            'fallidas': len(data['ordenes_fallidas']),
            'total': data['total_ordenes'],
            'progreso': f"{len(data['ordenes_procesadas'])}/{data['total_ordenes']}" if data['total_ordenes'] > 0 else "N/A",
            'porcentaje': round(len(data['ordenes_procesadas']) / data['total_ordenes'] * 100, 1) if data['total_ordenes'] > 0 else 0,
            'pagina_actual': data['pagina_actual'],
            'last_update': data['last_update']
        }
    
    def should_retry_orden(self, num_expediente: str, max_retries: int = 3) -> bool:
        """Verifica si una orden fallida debe reintentarse."""
        data = self.load()
        
        fallos = [o for o in data['ordenes_fallidas'] if o['num_expediente'] == num_expediente]
        return len(fallos) < max_retries


# Instancia global
checkpoint = QualitasCheckpoint()
