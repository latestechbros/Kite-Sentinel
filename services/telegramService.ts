
export const sendTelegramAlert = async (
  botToken: string, 
  chatId: string, 
  message: string
): Promise<boolean> => {
  if (!botToken || !chatId) {
    console.warn("Telegram config missing. Alert suppressed:", message);
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });
    return response.ok;
  } catch (error) {
    console.error("Failed to send Telegram alert:", error);
    return false;
  }
};
