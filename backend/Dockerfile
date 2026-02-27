FROM ubuntu:22.04

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    PYTHONPATH=/app

# Instalar Python, pip y zonas horarias
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Configurar zona horaria de Mazatlán
ENV TZ=America/Mazatlan
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

WORKDIR /app

COPY requirements.txt /app/
RUN pip3 install --no-cache-dir -r requirements.txt

# Instalar navegadores de Playwright y sus dependencias
RUN python3 -m playwright install chromium && \
    python3 -m playwright install-deps chromium

COPY . /app/

EXPOSE 8010

CMD ["python3", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8010"]
