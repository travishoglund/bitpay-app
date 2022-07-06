import { OS_CLI_ARG_NAME, IOS_PLATFORM_NAME, JEST_IMPLICIT_TIMEOUT, WD_IMPLICIT_TIMEOUT } from "./appium.consts.js";
import { ANDROID_CAPABILITIES, IOS_CAPABILITIES } from "./appium.config.js";
const wdio = require("webdriverio");

export class AppiumSetup {
    static async setup() {
        jest.setTimeout(JEST_IMPLICIT_TIMEOUT);
        let client = await wdio.remote(this.getMobileCapabilities());
        client.setImplicitTimeout(WD_IMPLICIT_TIMEOUT);
        return client;
    }

    /**
     * Looks for a custom command line argument provided with the same name as 'argument'. Returns the value of the argument.
     * ex: Given command 'npm run appium-test -- --os=Android', getCommandLineArgument("os") will return 'Android'.
     */
    static getCommandLineArgument(argument) {
        let result = "";

        process.argv.forEach((element) => {
            if (element.split("=")[0] === `--${argument}`) {
                result = element.split("=")[1];
            }
        });

        return result;
    }

    static getMobileCapabilities() {
        const os = this.getCommandLineArgument(OS_CLI_ARG_NAME).toLowerCase();
        return os === IOS_PLATFORM_NAME.toLowerCase() ? IOS_CAPABILITIES : ANDROID_CAPABILITIES;
    }
}
