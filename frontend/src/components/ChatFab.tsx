import { MessageSquare } from "lucide-react";

interface ChatFabProps {
  onClick: () => void;
  visible: boolean;
}

export default function ChatFab({ onClick, visible }: ChatFabProps) {
  if (!visible) return null;

  return (
    <button
      className="chat-fab"
      onClick={onClick}
      title="Chat with Chad"
    >
      <MessageSquare size={22} />
    </button>
  );
}
