# AWS 배포 — EC2 단일 인스턴스 + docker-compose

세 서비스(backend:8080, recommend-service:8000, gateway=nginx:80)를 EC2 한 대에서
`docker compose`로 띄운다. DB가 없고 상태는 전부 로컬 JSON/볼륨이라 구성이 가볍다.

관련 파일: [`docker-compose.yml`](../docker-compose.yml), [`.env.production.example`](../.env.production.example),
[`backend/Dockerfile`](../backend/Dockerfile), [`recommend-service/Dockerfile`](../recommend-service/Dockerfile),
[`frontend/Dockerfile`](../frontend/Dockerfile) + [`nginx.conf`](../frontend/nginx.conf),
[`.github/workflows/ci-cd.yml`](../.github/workflows/ci-cd.yml).

## 1. EC2 준비 (한 번만)

1. Ubuntu 22.04 이상, t3.medium 이상 권장(임베딩 모델 로딩에 메모리 필요 — 최소 4GB, 여유 있게 8GB).
2. 보안 그룹: 인바운드 22(SSH, 내 IP만), 80(HTTP, 0.0.0.0/0). 443은 TLS 붙일 때 추가.
3. Docker + Compose plugin 설치:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER
   sudo apt-get install -y docker-compose-plugin
   ```
4. 배포용 디렉터리에 레포 클론(이 경로가 GitHub Actions의 `EC2_DEPLOY_PATH`가 됨):
   ```bash
   git clone <repo-url> /opt/nyang && cd /opt/nyang
   cp .env.production.example .env   # 값 채우기 (아래 2번 참고)
   ```
5. (파인튜닝 모델을 쓰려면) IMDS 홉 제한을 늘려야 컨테이너 안에서 인스턴스 프로필 자격증명을
   읽을 수 있다 — 기본값(1)이면 Docker 브리지 네트워크 너머 컨테이너에서 실패한다:
   ```bash
   aws ec2 modify-instance-metadata-options --instance-id <id> --http-put-response-hop-limit 2
   ```

## 2. 시크릿 채우기

- **EC2의 `/opt/nyang/.env`** — `.env.production.example` 복사본. `ANTHROPIC_API_KEY`,
  `APP_CORS_ALLOWED_ORIGINS`/`CORS_ALLOWED_ORIGINS`(배포 도메인)을 채운다. 이 파일은 git에
  올라가지 않으므로 `git reset --hard`로 덮이지 않는다.
- **GitHub repo → Settings → Secrets and variables → Actions**:
  - `EC2_HOST`, `EC2_USER`(보통 `ubuntu`), `EC2_SSH_KEY`(배포 전용 private key), `EC2_DEPLOY_PATH`(예: `/opt/nyang`)
- 두 곳의 시크릿은 서로 다른 성격이다 — GitHub Secrets는 "배포 파이프라인이 EC2에 접속하는 키",
  EC2의 `.env`는 "애플리케이션이 실행 중에 쓰는 키". 둘 다 절대 레포에 커밋하지 않는다.

## 3. 파인튜닝 모델(ko-sroberta-reco, kobart) 처리

`pipeline/models/`는 `.gitignore` 대상이라 서버에도 없다. 셋 중 하나를 고른다:

- **아무것도 안 함(기본)** — `recommend-service`가 기동 시 `bge-m3` 공개모델을 자동 다운로드해서
  대신 쓴다(최초 기동 ~2GB, 이후 정확도는 파인튜닝 버전보다 낮음). 데모/1차 배포엔 이걸로 충분.
- **S3에서 받아오기** — 로컬에서 `aws s3 sync pipeline/models s3://<bucket>/` 로 한 번 올려두고,
  `.env`에 `MODEL_S3_URI=s3://<bucket>/ko-sroberta-reco` 지정. `entrypoint.sh`가 컨테이너 기동 시
  받아온다(볼륨 캐시 없이 매 `up --build`마다 다시 받으니, 자주 재배포한다면 EC2에 named volume
  마운트를 추가해 캐싱하는 걸 고려).
- **EC2에 직접 복사** — `scp -r pipeline/models ubuntu@<host>:/opt/nyang/pipeline/models` 후
  `docker-compose.yml`의 recommend-service에 `volumes: - ./pipeline/models:/app/pipeline/models`
  한 줄 추가.

## 4. 최초 배포

```bash
cd /opt/nyang
docker compose up -d --build
docker compose logs -f   # 세 컨테이너 다 뜨는지 확인
curl -s localhost/api/meta   # 백엔드
curl -s -X POST localhost/api/recommend -H 'content-type: application/json' -d '{}'  # 추천서비스
```

## 5. CI/CD 흐름

`main`에 push → `.github/workflows/ci-cd.yml`이 backend 빌드/테스트, frontend 빌드,
recommend-service 문법 체크를 돌리고 전부 통과하면 SSH로 EC2에 접속해
`git reset --hard origin/main` 후 `docker compose up -d --build`를 실행한다.
이미지는 EC2에서 직접 빌드한다(ECR 없이) — 인스턴스 한 대짜리 구성이라 가장 단순한 방식.
빌드 시간이 부담되면 이후 ECR 이미지 빌드+push 방식으로 바꿀 수 있다.

## 6. 배포 후 남은 것 (우선순위순)

1. **TLS** — 지금은 80(HTTP)만 연다. 실사용자 데이터(홈택스 연동, 거래내역)를 다루므로 HTTPS 필수.
   가장 간단한 방법은 Route 53 도메인 + ACM 인증서 + 이 EC2를 타깃으로 하는 ALB(단일 인스턴스도 ALB
   타깃 등록 가능) 추가, 또는 EC2에 Caddy/certbot을 얹어 TLS 종료.
2. **테스트 코드** — 현재 backend/recommend-service 모두 테스트가 없어 CI는 "빌드가 되는지"만
   검증한다. 회귀를 막으려면 최소한 `RankController`, `engine.py` 정도부터 테스트를 추가하는 게 좋다.
3. **모니터링/로그 보존** — `docker compose logs`는 컨테이너 재시작 시 사라진다. CloudWatch agent
   또는 `docker-compose.yml`에 로깅 드라이버 설정 추가 검토.
4. **`txn_data` 볼륨 백업** — 사용자 교정 데이터(`corrections.jsonl`)가 쌓이는 유일한 상태 저장소.
   EBS 스냅샷 주기 백업 권장.
