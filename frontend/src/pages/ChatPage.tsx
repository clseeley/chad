import { type FormEvent, useEffect, useRef, useState } from "react";
import client from "../api/client";
import type { Message } from "../types";

const CHANNEL_ICONS: Record<string, string> = {
  sms: "SMS",
  web: "WEB",
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    client.get("/conversations?limit=100").then(({ data }) => {
      setMessages(data);
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const userMsg: Message = {
      id: `temp-${Date.now()}`,
      channel: "web",
      direction: "inbound",
      role: "user",
      content: input.trim(),
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const { data } = await client.post("/conversations/message", {
        content: userMsg.content,
      });

      const assistantMsg: Message = {
        id: `temp-${Date.now()}-resp`,
        channel: "web",
        direction: "outbound",
        role: "assistant",
        content: data.response,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errMsg: Message = {
        id: `temp-${Date.now()}-err`,
        channel: "web",
        direction: "outbound",
        role: "assistant",
        content: "Sorry, something went wrong. Try again.",
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="chat-page">
      <div className="chat-header">
        <h2>Chat with Chad</h2>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>No messages yet. Say hi to your coach!</p>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`chat-bubble ${m.role === "user" ? "user" : "assistant"}`}
          >
            <div className="bubble-content">{m.content}</div>
            <div className="bubble-meta">
              <span className="channel-badge">
                {CHANNEL_ICONS[m.channel] || m.channel}
              </span>
              <span>
                {new Date(m.created_at).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>
        ))}
        {sending && (
          <div className="chat-bubble assistant">
            <div className="bubble-content typing">Chad is thinking...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="chat-input">
        <input
          type="text"
          placeholder="Message Chad..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
        />
        <button type="submit" disabled={sending || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
