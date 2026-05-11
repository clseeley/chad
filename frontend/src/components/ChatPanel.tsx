import { type FormEvent, useEffect, useRef, useState } from "react";
import { X, Send } from "lucide-react";
import client from "../api/client";
import type { Message } from "../types";

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChatPanel({ isOpen, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && !loaded) {
      client.get("/conversations?limit=100").then(({ data }) => {
        setMessages(data);
        setLoaded(true);
      });
    }
  }, [isOpen, loaded]);

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

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

  if (!isOpen) return null;

  return (
    <div className="chat-panel">
      <div className="chat-panel-header">
        <h3>Chat with Chad</h3>
        <button className="chat-panel-close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="chat-panel-messages">
        {messages.length === 0 && loaded && (
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

      <form onSubmit={handleSend} className="chat-panel-input">
        <input
          ref={inputRef}
          type="text"
          placeholder="Message Chad..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
        />
        <button type="submit" disabled={sending || !input.trim()}>
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
