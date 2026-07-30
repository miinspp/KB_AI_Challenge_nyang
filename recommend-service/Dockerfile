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
# torch 를 CPU 전용 휠로 먼저 고정한다. 기본 PyPI 휠은 CUDA 빌드라서 nvidia-cublas·cudnn·nccl 등
# 약 2.2GB(압축 기준)를 함께 끌고 오는데, EC2(t3)에는 GPU가 없어 전부 쓸모없는 용량이고
# 이것 때문에 이미지 레이어 추출 중 "no space left on device" 로 배포가 깨졌다.
# 이 줄이 torch 를 선점하므로 아래 requirements 설치는 CUDA 버전을 다시 받지 않는다.
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch
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
