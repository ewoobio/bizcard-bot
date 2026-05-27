const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

// 카카오 이미지 URL → base64 변환
async function imageUrlToBase64(url) {
  const response = await axios.get(url, { responseType: "arraybuffer" });
  return Buffer.from(response.data).toString("base64");
}

// OpenAI Vision으로 명함 분석 (실패 시 1회 재시도)
async function extractBusinessCard(imageUrl, attempt = 1) {
  const base64Image = await imageUrlToBase64(imageUrl);

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are a business card OCR expert. Extract all information from this business card image and return ONLY a JSON object with these exact keys:
{
  "name": "full name in original language",
  "company": "company name in original language",
  "title": "job title or department in original language",
  "phone": "phone number, prefer mobile if multiple exist",
  "email": "email address"
}
If a field is not found, use empty string "". Do not add any explanation outside the JSON.`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
                detail: "high",
              },
            },
          ],
        },
      ],
      max_tokens: 500,
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  const raw = response.data.choices[0].message.content;

  try {
    const parsed = JSON.parse(raw);
    // 필수 키 검증
    const required = ["name", "company", "title", "phone", "email"];
    const hasAll = required.every((k) => k in parsed);
    if (!hasAll) throw new Error("Missing keys");
    return parsed;
  } catch (e) {
    if (attempt < 2) {
      console.log("JSON 파싱 실패, 재시도 중...");
      return extractBusinessCard(imageUrl, 2);
    }
    throw new Error("명함 인식 실패: JSON 파싱 불가");
  }
}

// Make.com 웹훅으로 전송 (실패 시 1회 재시도)
async function sendToMake(payload, attempt = 1) {
  try {
    await axios.post(MAKE_WEBHOOK_URL, payload, { timeout: 10000 });
  } catch (e) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 2000));
      return sendToMake(payload, 2);
    }
    throw new Error("Make.com 전송 실패");
  }
}

// 카카오 챗봇 메인 엔드포인트
app.post("/webhook", async (req, res) => {
  const body = req.body;

  try {
    const userRequest = body.userRequest;
    const senderId = userRequest?.user?.id || "unknown";
    const attachments = userRequest?.attachments || [];

    // 이미지 첨부 확인
    const imageAttachment = attachments.find((a) => a.type === "image");
    const imageUrl =
      imageAttachment?.payload?.url ||
      body.action?.params?.image?.url ||
      userRequest?.params?.image?.url;

    if (!imageUrl) {
      return res.json({
        version: "2.0",
        template: {
          outputs: [
            {
              textCard: {
                title: "📸 명함 사진을 보내주세요",
                description: "명함 사진을 첨부하면 자동으로 저장해드립니다.",
              },
            },
          ],
        },
      });
    }

    // 명함 인식
    const cardData = await extractBusinessCard(imageUrl);

    // 날짜
    const today = new Date().toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Asia/Seoul",
    });

    // Make.com으로 전송
    const payload = {
      senderId,
      date: today,
      name: cardData.name,
      company: cardData.company,
      title: cardData.title,
      phone: cardData.phone,
      email: cardData.email,
    };

    await sendToMake(payload);

    // 영업사원에게 결과 응답
    return res.json({
      version: "2.0",
      template: {
        outputs: [
          {
            textCard: {
              title: "✅ 명함 저장 완료",
              description: [
                `👤 이름: ${cardData.name || "-"}`,
                `🏢 회사: ${cardData.company || "-"}`,
                `💼 직책: ${cardData.title || "-"}`,
                `📞 전화: ${cardData.phone || "-"}`,
                `📧 이메일: ${cardData.email || "-"}`,
                `📅 저장일: ${today}`,
              ].join("\n"),
            },
          },
        ],
      },
    });
  } catch (err) {
    console.error("Error:", err.message);
    return res.json({
      version: "2.0",
      template: {
        outputs: [
          {
            textCard: {
              title: "❌ 오류 발생",
              description: `처리 중 문제가 생겼습니다.\n사유: ${err.message}\n\n다시 시도해주세요.`,
            },
          },
        ],
      },
    });
  }
});

// 헬스체크 (Koyeb 필수)
app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`서버 실행 중: port ${PORT}`));
