import {
    ANDROID_PLATFORM_NAME,
    ANDROID_DEVICE_NAME,
    ANDROID_AUTOMATION_NAME,
    IOS_PLATFORM_NAME,
    IOS_DEVICE_NAME,
    IOS_AUTOMATION_NAME,
    ANDROID_APP,
    HOST_NAME,
    PORT
} from "./appium.consts.js";

export const ANDROID_CAPABILITIES = {
    path: HOST_NAME,
    port: PORT,
    capabilities: {
        platformName: ANDROID_PLATFORM_NAME,
        deviceName: ANDROID_DEVICE_NAME,
        app: ANDROID_APP,
        automationName: ANDROID_AUTOMATION_NAME
    }
};

export const IOS_CAPABILITIES = {
    path: HOST_NAME,
    port: PORT,
    capabilities: {
        platformName: IOS_PLATFORM_NAME,
        deviceName: IOS_DEVICE_NAME,
        automationName: IOS_AUTOMATION_NAME
    }
};
