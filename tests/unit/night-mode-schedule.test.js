/**
 * Tests for night mode schedule handling
 * The popup has no extension.features, so schedule changes must be
 * re-applied by the content script through the 'storage-changed' event.
 */

const storage = {};
const listeners = {};
const appended = [];

global.extension = {
	storage: {
		get: (key) => storage[key]
	},
	events: {
		on: (type, listener) => {
			listeners[type] = listener;
		}
	},
	features: {}
};

global.document = {
	createElement: () => {
		const element = {
			style: {},
			remove: jest.fn(() => appended.splice(appended.indexOf(element), 1))
		};

		return element;
	},
	documentElement: {
		appendChild: (element) => appended.push(element)
	}
};

require('../../js&css/extension/www.youtube.com/night-mode/night-mode.js');

const dim = extension.features.dim;

describe('Night mode schedule', () => {
	beforeEach(() => {
		for (const key in storage) { delete storage[key]; }
		extension.features.bluelight = jest.fn();
		extension.features.dim = dim;
		extension.features.dim();
		jest.useFakeTimers().setSystemTime(new Date(2026, 0, 1, 12, 0));
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	test('dim is removed once the current time is outside the schedule', () => {
		storage.dim = 50;
		extension.features.dim();
		expect(appended).toHaveLength(1);

		storage.schedule = 'sunset_to_sunrise';
		storage.schedule_time_from = '20:00';
		storage.schedule_time_to = '06:00';
		extension.features.dim();
		expect(appended).toHaveLength(0);
	});

	test.each(['schedule', 'schedule_time_from', 'schedule_time_to'])('changing %s re-applies the filters', (key) => {
		extension.features.dim = jest.fn();

		listeners['storage-changed']({ key, value: 'x' });

		expect(extension.features.bluelight).toHaveBeenCalledTimes(1);
		expect(extension.features.dim).toHaveBeenCalledTimes(1);
	});

	test('unrelated keys do not re-apply the filters', () => {
		listeners['storage-changed']({ key: 'theme', value: 'dark' });

		expect(extension.features.bluelight).not.toHaveBeenCalled();
	});
});

describe('Night mode menu', () => {
	let contentExtension;

	beforeEach(() => {
		contentExtension = global.extension;
		// Popup context: the menu skeleton exists, content script features do not.
		global.extension = { skeleton: { header: { sectionEnd: { menu: { on: { click: {} } } } } } };
		global.satus = { storage: { get: () => true } };
		jest.isolateModules(() => {
			require('../../menu/skeleton-parts/night-mode.js');
		});
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
		global.extension = contentExtension;
		delete global.satus;
	});

	test('changing schedule settings in the popup does not throw', () => {
		const nightMode = global.extension.skeleton.header.sectionEnd.menu.on.click.nightMode;
		const handlers = [];
		const seen = new Set();
		const collect = (node) => {
			if (!node || typeof node !== 'object' || seen.has(node)) { return; }
			seen.add(node);
			if (typeof node.onchange === 'function') { handlers.push(node.onchange); }
			for (const key of Object.keys(node)) { collect(node[key]); }
		};
		collect(nightMode);

		const schedule = nightMode.on.click.schedule;
		expect(schedule.schedule.component).toBe('select');
		expect(schedule.schedule_time_from.component).toBe('time');
		expect(schedule.schedule_time_to.component).toBe('time');

		expect(() => {
			for (const handler of handlers) { handler(); }
			jest.runAllTimers();
		}).not.toThrow();
	});
});
