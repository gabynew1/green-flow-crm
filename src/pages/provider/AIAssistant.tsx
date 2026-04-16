import { AIChatBox } from "@/components/AIChatBox";

export default function AIAssistant() {
  return (
    <div className="max-w-2xl mx-auto h-[calc(100vh-8rem)]">
      <h1 className="text-2xl font-bold mb-4">AI Assistant</h1>
      <AIChatBox inline />
    </div>
  );
}
