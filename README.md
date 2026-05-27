# 카카오 명함봇 배포 가이드 (Koyeb)

## 전체 흐름
영업사원이 카카오 채널에 명함 사진 전송
→ 카카오 챗봇이 서버로 이미지 전달
→ GPT-4o-mini가 명함 인식 (이름/회사/직책/전화/이메일)
→ Make.com 웹훅으로 Google Sheets에 자동 저장
→ 영업사원에게 결과 카드 응답

---

## Step 1. GitHub에 코드 올리기

1. https://github.com 에서 새 repository 생성 (이름: bizcard-bot)
2. 아래 명령어 실행:

```bash
cd bizcard-bot
git init
git add .
git commit -m "init"
git remote add origin https://github.com/[내아이디]/bizcard-bot.git
git push -u origin main
```

> ⚠️ `.env` 파일은 절대 올리지 마세요. `.env.example`만 올라갑니다.

---

## Step 2. Koyeb 배포

1. https://koyeb.com 가입 (GitHub 계정으로 바로 가능)
2. **Create Service** → **GitHub** 선택
3. `bizcard-bot` repo 선택
4. 설정:
   - **Build command**: `npm install`
   - **Start command**: `npm start`
   - **Port**: `3000`
   - **Health check path**: `/health`
5. **Environment Variables** 탭에서 추가:
   - `OPENAI_API_KEY` = OpenAI API 키
   - `MAKE_WEBHOOK_URL` = Make.com 웹훅 URL
6. **Deploy** 클릭

배포 완료 후 Koyeb이 URL을 발급해줍니다.
예: `https://bizcard-bot-xxxx.koyeb.app`

이 URL + `/webhook` 이 카카오 챗봇에 등록할 주소입니다.
예: `https://bizcard-bot-xxxx.koyeb.app/webhook`

---

## Step 3. Make.com 시나리오 설정

1. https://make.com 접속 → 새 시나리오 생성
2. **Webhooks** 모듈 추가 → **Custom Webhook**
3. 웹훅 URL 복사 → Koyeb 환경변수 `MAKE_WEBHOOK_URL`에 붙여넣기
4. **Google Sheets** 모듈 추가:
   - 시트 선택
   - 컬럼 매핑:
     - A열: `name`
     - B열: `company`
     - C열: `title`
     - D열: `phone`
     - E열: `email`
     - F열: `senderId`
     - G열: `date`
5. 시나리오 저장 후 **ON** 상태로 전환

---

## Step 4. 카카오 채널 챗봇 설정

1. https://business.kakao.com → 채널 관리자 센터
2. **챗봇** → **스킬** 추가
   - 스킬 URL: `https://bizcard-bot-xxxx.koyeb.app/webhook`
   - HTTP 메서드: POST
3. **시나리오** 설정:
   - 이미지 첨부 이벤트 → 위 스킬 연결
4. 테스트 채널에서 명함 사진 전송해서 확인

---

## 로컬 테스트 방법 (선택)

```bash
npm install
cp .env.example .env
# .env 파일에 실제 키 입력 후:
node server.js
```

---

## 문제 발생 시

| 증상 | 원인 | 해결 |
|---|---|---|
| 명함 인식 안 됨 | 사진 품질 낮음 | 밝은 곳에서 평평하게 찍기 |
| Google Sheets 저장 안 됨 | Make.com 시나리오 OFF | Make.com에서 ON 확인 |
| 서버 오류 | API 키 잘못됨 | Koyeb 환경변수 재확인 |
| 응답 없음 | 카카오 스킬 URL 틀림 | `/webhook` 경로 포함 여부 확인 |
