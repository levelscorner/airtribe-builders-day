import { WebConversation } from "../web/StudioWeb";
export function ChatScreen({
  chatId,
  videoId,
}: {
  chatId: string;
  videoId: string;
}) {
  return <WebConversation key={chatId} chatId={chatId} videoId={videoId} />;
}
