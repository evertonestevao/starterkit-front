import { describe, expect, it, vi } from "vitest";
import { createConsoleNotificationProvider } from "./consoleProvider";

describe("console NotificationProvider", () => {
  it("imprime canal, destinatário e corpo no terminal", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const provider = createConsoleNotificationProvider();

    await provider.send({
      channel: "whatsapp",
      to: "+5511999990000",
      title: "Lembrete",
      body: "Sua consulta é amanhã às 10h",
    });

    expect(provider.name).toBe("console");
    expect(spy).toHaveBeenCalledTimes(1);
    const logged = String(spy.mock.calls[0][0]);
    expect(logged).toContain("channel=whatsapp");
    expect(logged).toContain("to=+5511999990000");
    expect(logged).toContain("Sua consulta é amanhã às 10h");
    spy.mockRestore();
  });
});
