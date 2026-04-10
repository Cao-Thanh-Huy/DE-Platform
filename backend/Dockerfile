FROM python:3.13-alpine3.21

WORKDIR /app

# System deps — build tools for asyncpg (C extension) and libffi
RUN sed -i 's/https/http/g' /etc/apk/repositories && \
    apk add --no-cache gcc musl-dev libffi-dev postgresql-dev

# Python deps
COPY requirements.txt .
RUN pip install --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org --no-cache-dir -r requirements.txt

# Copy app code
COPY app/ ./app/

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
