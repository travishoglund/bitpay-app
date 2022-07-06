export const JEST_IMPLICIT_TIMEOUT = 60000;
export const WD_IMPLICIT_TIMEOUT = 10000;

export const PORT = 4723;
export const HOST_NAME = "/wd/hub";

export const ANDROID_PLATFORM_NAME = "Android";
export const ANDROID_DEVICE_NAME = "Android Emulator";
export const ANDROID_APP = "./android/app/build/outputs/apk/debug/app-debug.apk"
export const ANDROID_AUTOMATION_NAME = "UiAutomator2";

export const IOS_PLATFORM_NAME = "iOS";
export const IOS_DEVICE_NAME = "iPhone 12";
export const IOS_AUTOMATION_NAME = "XCUITest";

export const OS_CLI_ARG_NAME = "os";

/**
 * Helper Functions
 */
const MAX_ELEMENT_WAIT_THRESHOLD_MS = 10000;
async function findElement(driver, elementSelector, timeout = MAX_ELEMENT_WAIT_THRESHOLD_MS) {
    const element = await driver.$(elementSelector);
    await element.waitForExist({ timeout });
    return element;
}

async function tapElement(driver, elementSelector, timeout = MAX_ELEMENT_WAIT_THRESHOLD_MS) {
    const element = await findElement(driver, elementSelector, timeout);
    return element.click();
}

async function setValueOnElement(driver, elementSelector, value, timeout = MAX_ELEMENT_WAIT_THRESHOLD_MS) {
    const element = await findElement(driver, elementSelector, timeout);
    await element.setValue(value);
}
export { findElement, tapElement, setValueOnElement};


