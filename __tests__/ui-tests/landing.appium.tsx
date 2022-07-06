import { AppiumSetup } from "./appium.setup.js";
import {OS_CLI_ARG_NAME, IOS_PLATFORM_NAME, findElement, tapElement} from "./appium.consts.js";

let client: any;
let isIOS: boolean;
let visible: string;

const slide1Title = 'Turn crypto into dollars with our BitPay Card';
const slide2Title = 'Spend crypto at your favorite places';
const slide3Title = 'Keep your funds safe & secure';

beforeAll(async () => {
	client = await AppiumSetup.setup();
	if (AppiumSetup.getCommandLineArgument(OS_CLI_ARG_NAME).toLowerCase() === IOS_PLATFORM_NAME.toLowerCase()) {
		isIOS = true;
		visible = "visible";
	} else {
		isIOS = false;
		visible = "displayed";
	}
});

beforeEach(async () => {
	await client.launchApp();
});

afterAll(async () => {
	// Reset to first carousel in case we run tests back to back
	if(isIOS) {
		await tapElement(client, `(//XCUIElementTypeOther[@name="Get Started"])[1]/XCUIElementTypeOther[1]/XCUIElementTypeOther/XCUIElementTypeOther[1]/XCUIElementTypeOther`)
	}
	await client.deleteSession();
});

test("Carousel is rendered", async () => {
	const carousel = await findElement(client, "~component-onboarding-container", 20000);
	expect(await carousel.isDisplayed()).toEqual(true);
});

test("Carousel only renders first slide", async () => {
	if(isIOS) {
		const slide1 = await findElement(client, `//XCUIElementTypeStaticText[@name="${slide1Title}"]`);
		const slide2 = await findElement(client, `//XCUIElementTypeStaticText[@name="${slide2Title}"]`);

		expect(await slide1.isDisplayed()).toEqual(true);
		expect(await slide2.isDisplayed()).toEqual(false);
	}
});

test("Carousel tap navigation to second slide", async () => {
	if(isIOS) {
		await tapElement(client, `(//XCUIElementTypeOther[@name="Get Started"])[1]/XCUIElementTypeOther[1]/XCUIElementTypeOther/XCUIElementTypeOther[2]/XCUIElementTypeOther`);
		const slide1 = await findElement(client, `//XCUIElementTypeStaticText[@name="${slide1Title}"]`);
		const slide2 = await findElement(client, `//XCUIElementTypeStaticText[@name="${slide2Title}"]`);
		expect(await slide1.isDisplayed()).toEqual(false);
		expect(await slide2.isDisplayed()).toEqual(true);
	}
});

test("Carousel swipe navigation to third slide", async () => {
	if(isIOS) {
		await client.touchPerform([
			{ action: 'press', options: { x: 300, y: 250 }},
			{ action: 'wait', options: { ms: 100 }},
			{ action: 'moveTo', options: { x: 100, y: 250 }},
			{ action: 'release' }
		]);

		const slide2 = await findElement(client, `//XCUIElementTypeStaticText[@name="${slide2Title}"]`);
		const slide3 = await findElement(client, `//XCUIElementTypeStaticText[@name="${slide3Title}"]`);

		expect(await slide2.isDisplayed()).toEqual(false);
		expect(await slide3.isDisplayed()).toEqual(true);
	}
});
