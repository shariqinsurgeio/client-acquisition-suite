/**
 * Puppeteer-Lite: chrome.debugger wrapper for stealth automation
 * Uses Chrome DevTools Protocol for human-like interactions
 */

// Random delay for human-like behavior
export const humanDelay = (min = 1000, max = 3000): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, min + Math.random() * (max - min)));

// Short random delay for keystrokes
const keystrokeDelay = (): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 100));

/**
 * Attach debugger to a tab
 */
export async function attachDebugger(tabId: number): Promise<void> {
    try {
        await chrome.debugger.attach({ tabId }, "1.3");
        console.log("Debugger attached to tab:", tabId);
    } catch (e: any) {
        // Already attached or user declined
        console.warn("Debugger attach failed:", e.message);
    }
}

/**
 * Detach debugger from tab
 */
export async function detachDebugger(tabId: number): Promise<void> {
    try {
        await chrome.debugger.detach({ tabId });
    } catch (e) {
        // Already detached
    }
}

/**
 * Send CDP command to tab
 */
async function sendCommand(tabId: number, method: string, params?: any): Promise<any> {
    return chrome.debugger.sendCommand({ tabId }, method, params);
}

/**
 * Human-like typing using CDP Input.dispatchKeyEvent
 */
export async function humanType(tabId: number, text: string): Promise<void> {
    for (const char of text) {
        // Key down
        await sendCommand(tabId, "Input.dispatchKeyEvent", {
            type: "keyDown",
            text: char,
        });
        // Key up
        await sendCommand(tabId, "Input.dispatchKeyEvent", {
            type: "keyUp",
            text: char,
        });
        await keystrokeDelay();
    }
}

/**
 * Scroll page using CDP
 */
export async function scrollPage(tabId: number, distance = 500): Promise<void> {
    await sendCommand(tabId, "Input.synthesizeScrollGesture", {
        x: 300,
        y: 300,
        yDistance: -distance, // Negative = scroll down
        speed: 800 + Math.random() * 400, // Random speed
    });
}

/**
 * Click at coordinates using CDP
 */
export async function clickAt(tabId: number, x: number, y: number): Promise<void> {
    await sendCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mousePressed",
        x, y,
        button: "left",
        clickCount: 1,
    });
    await humanDelay(50, 100);
    await sendCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x, y,
        button: "left",
        clickCount: 1,
    });
}

/**
 * Get page scroll height using CDP
 */
export async function getScrollHeight(tabId: number): Promise<number> {
    const result = await sendCommand(tabId, "Runtime.evaluate", {
        expression: "document.body.scrollHeight",
        returnByValue: true,
    });
    return result?.result?.value || 0;
}

/**
 * Scroll to bottom of page
 */
export async function scrollToBottom(tabId: number): Promise<void> {
    await sendCommand(tabId, "Runtime.evaluate", {
        expression: "window.scrollTo(0, document.body.scrollHeight)",
    });
}
