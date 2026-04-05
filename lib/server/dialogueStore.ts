import { prisma, isDatabaseConfigured } from './prisma.js';

export async function persistChatTurn(
  conversationId: string | undefined,
  userMessage: string,
  assistantReply: string,
): Promise<void> {
  if (!isDatabaseConfigured() || !conversationId?.trim()) return;
  const id = conversationId.trim();
  try {
    await prisma.chatConversation.upsert({
      where: { id },
      create: { id },
      update: { updatedAt: new Date() },
    });
    await prisma.chatMessage.createMany({
      data: [
        { conversationId: id, role: 'user', content: userMessage },
        { conversationId: id, role: 'assistant', content: assistantReply },
      ],
    });
  } catch (e) {
    console.error('persistChatTurn', e);
  }
}
