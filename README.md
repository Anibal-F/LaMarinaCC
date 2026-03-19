# 🚗 La Marina Collision Center - ERP System

[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite)](https://vitejs.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](https://www.docker.com/)

> **Sistema de Gestión Integral (ERP)** para taller de colisión automotriz. Administra recepciones, valuación de daños, inventario, pintura, facturación y comunicación con clientes vía WhatsApp.

---

## 📋 Tabla de Contenidos

- [Características](#-características)
- [Arquitectura](#-arquitectura)
- [Tecnologías](#-tecnologías)
- [Requisitos](#-requisitos)
- [Instalación](#-instalación)
- [Configuración](#-configuración)
- [Uso](#-uso)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [API Documentation](#-api-documentation)
- [Despliegue](#-despliegue)
- [Licencia](#-licencia)

---

## ✨ Características

### 📝 Gestión de Operaciones
- **Recepción de Vehículos**: Registro completo de entrada de unidades con datos del cliente y vehículo
- **Valuación de Daños**: Control de cotizaciones y aprobaciones de reparaciones
- **Taller**: Seguimiento del proceso de reparación mecánica
- **Pintura**: Control de trabajo de pintura y acabados
- **Inventario**: Administración de refacciones y piezas

### 🤖 Automatización (RPA)
- **Extracción automática** de órdenes y cotizaciones desde portales de aseguradoras
- Integración con **Qualitas** y **Chubb**
- Procesamiento automático de documentos PDF y Excel

### 💬 Comunicación
- **WhatsApp Cloud API** integrado
- Chat en tiempo tiempo con clientes
- Respuestas automáticas para consultas frecuentes (ubicación, horarios)
- Envío de documentos (PDFs, fotos) directamente por WhatsApp

### 📊 Reportes y Administración
- Panel de indicadores por aseguradora
- Reportes de productividad
- Gestión de clientes y expedientes
- Control de usuarios y permisos

### 🔊 Transcripción de Audio
- Transcripción automática de notas de voz usando **AWS Transcribe**
- Soporte para español (es-MX, es-US, es-ES)

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                        Cliente                               │
│              (Navegador Web / Móvil)                         │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                     Frontend                                 │
│              React 18 + Vite + Tailwind CSS                  │
│                      Puerto: 3010                            │
└───────────────────────┬─────────────────────────────────────┘
                        │ API REST /api
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                     Backend                                  │
│              FastAPI + SQLAlchemy + psycopg                  │
│                      Puerto: 8010                            │
└───────┬───────────────┬───────────────┬─────────────────────┘
        │               │               │
        ▼               ▼               ▼
┌──────────┐   ┌──────────────┐   ┌──────────────┐
│PostgreSQL│   │AWS Transcribe│   │WhatsApp Cloud│
│  Puerto: │   │              │   │     API      │
│  5436    │   │              │   │              │
└──────────┘   └──────────────┘   └──────────────┘
```

---

## 🛠️ Tecnologías

### Frontend
| Tecnología | Versión | Uso |
|------------|---------|-----|
| React | 18.3.1 | UI Library |
| React Router | 7.13.0 | Navegación |
| Vite | 5.4.6 | Build Tool |
| Tailwind CSS | 3.4.10 | Estilos |

### Backend
| Tecnología | Versión | Uso |
|------------|---------|-----|
| FastAPI | 0.115.0 | Framework API |
| Uvicorn | 0.30.6 | ASGI Server |
| SQLAlchemy | 2.0.34 | ORM |
| psycopg | 3.2.13 | PostgreSQL Driver |
| Pydantic | 2.5.2 | Validación de datos |

### Automatización & Servicios
| Tecnología | Versión | Uso |
|------------|---------|-----|
| Playwright | 1.53.0 | RPA / Web Scraping |
| Playwright Stealth | 2.0.2 | Evasión de detección |
| boto3 | 1.35.36 | AWS SDK |
| ReportLab | 4.2.5 | Generación de PDFs |
| OpenPyXL | 3.1.5 | Procesamiento Excel |

### Infraestructura
| Tecnología | Uso |
|------------|-----|
| Docker | Contenerización |
| Docker Compose | Orquestación local |
| PostgreSQL | Base de datos |
| pgAdmin | Administración DB |

---

## 📦 Requisitos

- **Docker** 20.10+ y **Docker Compose** 2.0+
- **Git**
- Opcional: **Node.js** 18+ (para desarrollo frontend local)
- Opcional: **Python** 3.11+ (para desarrollo backend local)

---

## 🚀 Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/tu-usuario/LaMarinaCC.git
cd LaMarinaCC
```

### 2. Configurar variables de entorno

```bash
# Desarrollo local
cp .env.dev.example .env.dev

# Editar .env.dev con tus configuraciones
nano .env.dev
```

### 3. Iniciar con Docker Compose

```bash
# Modo desarrollo (con hot-reload)
docker-compose -f docker-compose.dev.yml up -d

# O modo producción
docker-compose -f docker-compose.prod.yml up -d
```

### 4. Verificar servicios

| Servicio | URL |
|----------|-----|
| Frontend | http://localhost:3010 |
| Backend API | http://localhost:8010 |
| API Docs (Swagger) | http://localhost:8010/docs |
| pgAdmin | http://localhost:5050 |

---

## ⚙️ Configuración

### Variables de Entorno Principales

```env
# Base de datos
DATABASE_URL=postgresql+psycopg://user:pass@host:5432/lamarinacc

# AWS (Transcripción de audio)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=tu-access-key
AWS_SECRET_ACCESS_KEY=tu-secret-key
AWS_TRANSCRIBE_BUCKET=lamarinacc-transcribe

# WhatsApp Cloud API
WHATSAPP_PHONE_NUMBER_ID=tu-phone-id
WHATSAPP_ACCESS_TOKEN=tu-token
WHATSAPP_WEBHOOK_VERIFY_TOKEN=tu-verify-token
WHATSAPP_TEMPLATE_RECEPCION=recepcion_automovil

# CORS (producción)
CORS_ORIGINS=https://tu-dominio.com
```

> 🔒 **Nota**: Nunca subas archivos `.env` con credenciales reales al repositorio.

---

## 💻 Uso

### Desarrollo Local

```bash
# Frontend (desde ./frontend)
npm install
npm run dev

# Backend (desde ./backend)
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8010
```

### Comandos Docker Útiles

```bash
# Ver logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Reconstruir contenedores
docker-compose -f docker-compose.dev.yml up -d --build

# Detener todo
docker-compose down

# Acceder a la base de datos
docker-compose exec db psql -U postgres -d lamarinacc
```

---

## 📁 Estructura del Proyecto

```
LaMarinaCC/
├── 📁 frontend/                  # Aplicación React
│   ├── src/
│   │   ├── components/          # Componentes reutilizables
│   │   ├── pages/               # Páginas principales
│   │   ├── hooks/               # Custom hooks
│   │   ├── utils/               # Utilidades
│   │   ├── App.jsx              # Componente raíz
│   │   └── main.jsx             # Punto de entrada
│   ├── package.json
│   └── vite.config.js
│
├── 📁 backend/                   # API FastAPI
│   ├── app/
│   │   ├── main.py              # Punto de entrada
│   │   ├── core/                # Configuración y DB
│   │   ├── auth/                # Autenticación
│   │   └── modules/             # Módulos del sistema
│   │       ├── administracion/  # Panel admin + RPA
│   │       ├── clientes/        # Gestión de clientes
│   │       ├── recepcion/       # Recepción de vehículos
│   │       ├── valuacion_danos/ # Valuación de daños
│   │       ├── taller/          # Control de taller
│   │       ├── pintura/         # Control de pintura
│   │       ├── inventario/      # Inventario de piezas
│   │       ├── expedientes/     # Gestión de expedientes
│   │       ├── reportes/        # Reportes y métricas
│   │       └── catalogos/       # Catálogos del sistema
│   │   └── rpa/                 # Scripts de automatización
│   ├── requirements.txt
│   └── Dockerfile
│
├── 📁 infra/                     # Configuración de infraestructura
├── 📁 scripts/                   # Scripts de utilidad
├── 📁 static/                    # Archivos estáticos
├── docker-compose.dev.yml        # Config desarrollo
├── docker-compose.prod.yml       # Config producción
└── README.md
```

---

## 📚 API Documentation

La documentación interactiva de la API está disponible en:

- **Swagger UI**: http://localhost:8010/docs
- **ReDoc**: http://localhost:8010/redoc

### Endpoints Principales

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/` | Health check |
| `GET` | `/health` | Estado del sistema |
| `POST` | `/auth/login` | Autenticación |
| `GET` | `/api/clientes` | Listar clientes |
| `POST` | `/api/recepciones` | Crear recepción |
| `GET` | `/api/whatsapp/chat/conversations` | Chats activos |
| `POST` | `/webhooks/whatsapp` | Webhook WhatsApp |

---

## 🌐 Despliegue

### Producción con Docker

```bash
# 1. Configurar variables de producción
cp .env.prod.example .env.prod
# Editar .env.prod con credenciales reales

# 2. Desplegar
docker-compose -f docker-compose.prod.yml up -d

# 3. Verificar estado
docker-compose ps
```

### Consideraciones de Seguridad

- ✅ Usar HTTPS en producción
- ✅ Configurar CORS apropiadamente
- ✅ Rotar tokens y contraseñas regularmente
- ✅ Habilitar autenticación en pgAdmin
- ✅ Restringir acceso a puertos de base de datos

---

## 🧪 Testing

```bash
# Backend tests (si están configurados)
cd backend
pytest

# Frontend tests (si están configurados)
cd frontend
npm test
```

---

## 🤝 Contribución

1. Fork el repositorio
2. Crea una rama (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -am 'Agrega nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

---

## 📝 Licencia

Este proyecto es propiedad de **La Marina Collision Center**. Todos los derechos reservados.

---

## 👥 Autor

**Aníbal Fuentes** - Desarrollo y Arquitectura

---

## 🙏 Agradecimientos

- [FastAPI](https://fastapi.tiangolo.com/) - Framework backend increíble
- [React](https://reactjs.org/) - UI library
- [Tailwind CSS](https://tailwindcss.com/) - Estilos utility-first
- [Docker](https://www.docker.com/) - Contenerización simplificada

---

<p align="center">
  <b>La Marina Collision Center</b> 🚗💨<br>
  <i>Tecnología de punta para la excelencia automotriz</i>
</p>
