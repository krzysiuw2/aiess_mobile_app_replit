FROM python:3.11-slim-bookworm

WORKDIR /var/task

ENV PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENTRYPOINT [ "python", "-m", "awslambdaric" ]
CMD [ "handler.lambda_handler" ]
