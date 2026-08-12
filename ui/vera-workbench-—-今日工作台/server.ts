import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize Gemini client if API key is present
  const apiKey = process.env.GEMINI_API_KEY;
  let ai: GoogleGenAI | null = null;
  if (apiKey) {
    ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }

  // --- API Routes ---

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Overview analytics endpoint
  app.get("/api/analytics/overview", (_req, res) => {
    res.json({
      activeCases: 14,
      newCasesThisMonth: 5,
      submittedCases: 8,
      expectedCommission: "$85,400",
      summaryNote: "今天 3 个待办 · 2 个到期/逾期 · 1 个银行回复待处理",
      overdueCount: 2,
      dueTodayCount: 1,
      pendingBankReplies: 3,
    });
  });

  // Tasks endpoint
  app.get("/api/tasks", (_req, res) => {
    res.json([
      {
        id: "TASK-101",
        caseId: "CASE-001",
        clientName: "PERSON_1",
        bankName: "CBA",
        title: "催请客户提交 HECS 贷款结清凭证与流水记录",
        priority: "urgent",
        dueDate: "2026-08-10",
        overdueDays: 2,
        status: "pending",
        isAiSuggested: true,
        category: "document",
        description: "CBA 审批员明确此项为 Formal Approval 的前置条件，需在 24 小时内上传。"
      },
      {
        id: "TASK-102",
        caseId: "CASE-003",
        clientName: "Michael Chen",
        bankName: "ANZ",
        title: "核对会计师声明 (CPA Letter) 与 2025 BAS 报表收入一致性",
        priority: "urgent",
        dueDate: "2026-08-11",
        overdueDays: 1,
        status: "pending",
        isAiSuggested: false,
        category: "document",
        description: "自雇核算公式与 ANZ Policy 的差距须在提交前修正。"
      },
      {
        id: "TASK-103",
        caseId: "CASE-002",
        clientName: "Sarah Zhang",
        bankName: "Westpac",
        title: "发送本周六拍卖出价指南与预批信副本",
        priority: "high",
        dueDate: "2026-08-12",
        status: "pending",
        isAiSuggested: true,
        category: "client_contact",
        description: "客户周六参与拍卖，需确认首付资金到位证明与预批条款注意事项。"
      },
      {
        id: "TASK-104",
        caseId: "CASE-004",
        clientName: "PERSON_2",
        bankName: "NAB",
        title: "跟进 PEXA 电子割接状态与旧银行结清清单",
        priority: "medium",
        dueDate: "2026-08-15",
        status: "pending",
        isAiSuggested: false,
        category: "settlement",
        description: "确认放款日前旧抵押权解除申请 (Discharge Form) 无延迟。"
      },
      {
        id: "TASK-105",
        caseId: "CASE-005",
        clientName: "David & Emma Taylor",
        bankName: "Macquarie",
        title: "跟踪客户对 3 方案借贷能力对比邮件的反馈",
        priority: "low",
        dueDate: "2026-08-16",
        status: "pending",
        isAiSuggested: true,
        category: "bank_reply",
        description: "生成 Macquarie vs ANZ 利率与费用对比报告。"
      }
    ]);
  });

  app.post("/api/tasks/toggle", (req, res) => {
    const { taskId } = req.body;
    res.json({ success: true, taskId, toggledAt: new Date().toISOString() });
  });

  app.get("/api/cases", (_req, res) => {
    res.json([
      {
        id: "CASE-001",
        clientName: "PERSON_1",
        bankName: "CBA",
        loanAmount: 850000,
        stage: "submission",
        statusText: "等待补件审理",
        urgency: "high",
        lastUpdated: "10 分钟前"
      },
      {
        id: "CASE-002",
        clientName: "Sarah Zhang",
        bankName: "Westpac",
        loanAmount: 1200000,
        stage: "approval",
        statusText: "预批已通过",
        urgency: "medium",
        lastUpdated: "1 小时前"
      },
      {
        id: "CASE-003",
        clientName: "Michael Chen",
        bankName: "ANZ",
        loanAmount: 620000,
        stage: "docs_collect",
        statusText: "补集自雇财务报表",
        urgency: "high",
        lastUpdated: "今天 09:30"
      }
    ]);
  });

  app.post("/api/cases/create", (req, res) => {
    const newCase = req.body;
    res.json({ success: true, case: newCase });
  });

  // AI Chat endpoint
  app.post("/api/chat", async (req, res) => {
    const { message, caseId } = req.body;

    if (!message) {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    if (ai) {
      try {
        const systemInstruction = `你是 Vera，一位澳大利亚资深贷款经纪人（Mortgage Broker）的专业 AI 案件大脑。
你的用户也是 Vera 团队的贷款专家。
说话语气专业、精准、简明、高效，充满对澳洲四大银行（CBA、Westpac、ANZ、NAB）和 Macquarie 政策的熟练度。
针对用户的输入或案件问题，直接给出具有实操价值的建议、合规提醒或下一步动作。
请直接用中文作答，金额原样展示（如 $850,000），银行名原样展示（如 CBA, Westpac），脱敏数据保持原有标识（如 PERSON_1）。`;

        const response = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: `[当前操作案件ID: ${caseId || '全局工作台'}]\n用户询问/指令: ${message}`,
          config: {
            systemInstruction,
            temperature: 0.7,
          },
        });

        const replyText = response.text || "已处理您的请求。";
        res.json({
          reply: replyText,
          suggestions: [
            "自动生成补件说明邮件",
            "根据借贷政策计算 Max DTI 覆盖率",
            "添加到今日待办清单"
          ]
        });
        return;
      } catch (err) {
        console.error("Gemini API call failed, using graceful fallback response:", err);
      }
    }

    // Smart fallback if AI key missing or offline
    let reply = `针对您提出的：“${message}”，Vera 已完成政策规则匹配：\n1. 请优先在后台检查该案件的 PAYG 与 HECS 债务平衡；\n2. 推荐使用 CBA / Westpac 极速通道，当前审理时效为 2-3 个工作日；\n3. 已为您整理出对应的跟进提醒格式。`;

    if (message.includes("补件") || message.includes("文件")) {
      reply = `关于材料补件需求：通常需重点留意最近 30 天内的工资单 (Payslip)、银行流水中的定存/信用卡额度扣减项。针对该案件，建议直接向客户发送带有加密附件链接的简讯。`;
    } else if (message.includes("佣金") || message.includes("放款") || message.includes("结算")) {
      reply = `根据放款计划，本月预估共有 8 笔案件交割，预计对应产生 $85,400 笔佣金。最快一笔割接为 PERSON_2 (NAB) 的 $950,000 转贷案件。`;
    }

    res.json({
      reply,
      suggestions: [
        "查看客户全景档案",
        "拟定银行沟通草稿",
        "更新案件到期日程"
      ]
    });
  });

  // Vite middleware for development vs static serve for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Vera Workbench Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
