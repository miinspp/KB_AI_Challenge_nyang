# 빌드 컨텍스트는 저장소 루트여야 합니다 (docker build -f recommend-service/Dockerfile .)
# engine.py 가 pipeline/models 를 recommend-service 의 "형제 디렉터리"로 참조하기 때문에
# 컨테이너 안에서도 같은 상대 구조(/app/recommend-service, /app/pipeline)를 유지합니다.
FROM python:3.11-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl unzip \
    && rm -rf /var/lib/apt/lists/*
# AWS CLI v2 — entrypoint.sh 가 S3에서 파인튜닝 모델 가중치를 받아올 때 사용
RUN curl -sS "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o awscliv2.zip \
    && unzip -q awscliv2.zip && ./aws/install && rm -rf awscliv2.zip aws

COPY recommend-service/requirements.txt recommend-service/requirements.txt
RUN pip install --no-cache-dir -r recommend-service/requirements.txt

COPY recommend-service recommend-service
# pipeline/models 는 레포에 없음(파인튜닝 가중치 400MB대, .gitignore 처리) — entrypoint.sh 가
# 컨테이너 시작 시 MODEL_S3_URI에서 받아온다. 못 받으면 engine.py 가 bge-m3 공개모델로 자동 폴백한다.
RUN mkdir -p pipeline/models
RUN chmod +x recommend-service/entrypoint.sh

RUN useradd --create-home --shell /bin/false appuser && chown -R appuser:appuser /app
USER appuser

WORKDIR /app/recommend-service
EXPOSE 8000
ENTRYPOINT ["./entrypoint.sh"]
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
