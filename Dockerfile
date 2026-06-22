FROM public.ecr.aws/docker/library/python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1     PYTHONUNBUFFERED=1

WORKDIR /app

COPY app.py /app/app.py
COPY web /app/web

RUN mkdir -p /app/data

EXPOSE 8000

CMD ["python", "app.py"]
