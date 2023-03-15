import glog from 'fancy-log'
import semver from 'semver'
import AbortController from 'abort-controller'
import extend from 'extend'
import loadyaml from './loadyaml.js'
import Queue from 'promise-queue';
import { performance } from 'perf_hooks';
import fetch from 'node-fetch';

const instances = loadyaml("./data/instances.yml")

const pqueue = new Queue(32)

const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:99.0) Gecko/20100101 Firefox/99.0";

function safeFetch(method, url, options)/*: Promise<Response | null | false | undefined>*/ {
	const controller = new AbortController()
	const timeout = setTimeout(
		() => { controller.abort() },
		30000
	)
	const start = performance.now();
	// glog("POST start", url)
	return fetch(url, extend(true, options, { method, signal: controller.signal })).then(
		res => {
			if (res?.ok) {
				const end = performance.now();
				if (end - start > 1000) {
					glog.warn("POST slow", url, (end - start) / 1000)
				}
				return res;
			}
			glog("POST finish", url, res.status, res.ok)
			if (res.status >= 500 && res.status < 600) return null;
		},
		async e => {
			glog("POST failed...", url, e.errno, e.type)
			if (e.errno?.toLowerCase().includes('timeout') || e.type === 'aborted') return null;
			return false;
		}
	).finally(() => {
		clearTimeout(timeout)
	})
}

async function fetchJson(method, url, json) {
	const option = {
		body: JSON.stringify(json ? json : {}),
		headers: {
			"Content-Type": "application/json",
			"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:99.0) Gecko/20100101 Firefox/99.0"
		},
		redirect: "error"
	};

	let retryCount = 0;

	while (retryCount < 2) {
		if (retryCount > 0) glog('retry', url, retryCount);
		await new Promise(resolve => retryCount > 0 ? setTimeout(resolve, 20000) : resolve());
		const res = await safeFetch(method, url, option)
			.then(res => {
				if (res === null) return null;
				if (!res) return false;
				return res.json();
			})
			.catch(e => {
				glog.error(url, e)
				return false
			});

		if (res === false) return false;
		if (res !== null) return res;
		retryCount += 1;
	}
	return false;
}

async function getNodeinfo(base)/*: Promise<Response | null | false | undefined>*/ {
	const controller = new AbortController()
	const timeout = setTimeout(
		() => { controller.abort() },
		30000
	)

	const wellnownUrl = `https://${base}/.well-known/nodeinfo`;

	const wellknown = await fetch(wellnownUrl, {
		method: "GET",
		headers: {
			"User-Agent": ua,
		},
		redirect: "error",
		signal: controller.signal
	}).then(res => {
		if (res?.ok) {
			glog("Get WellKnown Nodeinfo finish", wellnownUrl, res.status, res.ok)
			return res.json();
		}
		return;
	}).catch(async e => {
		glog("Get WellKnown Nodeinfo failed...", wellnownUrl, e.errno, e.type)
		return;
	}).finally(() => {
		clearTimeout(timeout);
	});

	if (wellknown.links == null || !Array.isArray(wellknown.links)) {
		glog("WellKnown Nodeinfo was Not Array", wellnownUrl, wellknown);
		return null;
	}

	const links = wellknown.links;

	const lnik1_0 = links.find(link => link.rel === 'http://nodeinfo.diaspora.software/ns/schema/1.0');
	const lnik2_0 = links.find(link => link.rel === 'http://nodeinfo.diaspora.software/ns/schema/2.0');
	const lnik2_1 = links.find(link => link.rel === 'http://nodeinfo.diaspora.software/ns/schema/2.1');
	const link = lnik2_1 ?? lnik2_0 ?? lnik1_0;

	if (link == null || typeof link !== 'object') {
		glog("Nodeinfo Link was Null", wellnownUrl);
		return null;
	}

	const controller2 = new AbortController()
	const timeout2 = setTimeout(
		() => { controller2.abort() },
		30000
	)

	const info = await fetch(link.href, {
		method: "GET",
		headers: {
			"User-Agent": ua,
		},
		redirect: "error",
		signal: controller2.signal
	}).then(res => {
		if (res?.ok) {
			glog("Get Nodeinfo finish", link.href, res.status, res.ok)
			return res.json();
		}
		return;
	}).catch(async e => {
		glog("Get Nodeinfo failed...", link.href, e.errno, e.type)
		if (e.errno?.toLowerCase().includes('timeout') || e.type === 'aborted') return null;
		return;
	}).finally(() => {
		clearTimeout(timeout2);
	})

	return info;
}

async function safeGetNodeInfo(base) {
	const retry = (timeout) => new Promise((res, rej) => {
		setTimeout(() => {
			getNodeinfo(base).then(res, rej)
		}, timeout)
	});
	return getNodeinfo(base)
		.then(res => res === undefined ? retry(10000) : res)
		.catch(e => retry(10000))
		.catch(() => null);
}

// misskey-dev/misskeyを最後に持っていくべし
export const ghRepos = [
	//"mei23/misskey",
	//"mei23/misskey-v11",
	//"kokonect-link/cherrypick",
	"misskey-dev/misskey"
];

export const gtRepos = [
	//"codeberg.org/thatonecalculator/calckey",
	//"akkoma.dev/FoundKeyGang/FoundKey",
]

function hasVulnerability(repo, version) {
	switch (repo) {
		case 'misskey-dev/misskey':
			return (
				semver.satisfies(version, '< 12.119.2') ||
				//semver.satisfies(version, '< 12.90.0') ||
				//semver.satisfies(version, '< 12.51.0') ||
				semver.satisfies(version, '>= 10.46.0 < 10.102.4 || >= 11.0.0-alpha.1 < 11.20.2')
			);
		/*
		case 'mei23/misskey':
			return (
				semver.satisfies(version, '< 10.102.608-m544') ||
				semver.satisfies(version, '< 10.102.338-m544')
			);
		case 'mei23/misskey-v11':
			return (
				semver.satisfies(version, '< 11.37.1-20221202185541') ||
				semver.satisfies(version, '< 11.37.1-20210825162615')
			);
		case 'FoundKeyGang/FoundKey':
			return (
				semver.satisfies(version, '< v13.0.0-preview3')
			);
		*/
		default:
			return false;
	}
}

async function getVersions() {
	glog("Getting Misskey Versions")
	const maxRegExp = /<https:\/\/.*?>; rel="next", <https:\/\/.*?\?page=(\d+)>; rel="last"/;
	const versions = new Map();
	const versionOutput = {};

	const vqueue = new Queue(3)

	for (const repo of gtRepos) {
		glog(repo, "Start")
		const repoSplit = repo.split('/');
		const res = await fetch(`https://${repoSplit[0]}/api/v1/repos/${repoSplit[1]}/${repoSplit[2]}/tags`, { "User-Agent": ua, }).catch(() => null);
		if (!res || !res.ok) {
			glog.error(`Failed to get tags from ${repo} (response is not ok)`);
			continue;
		};
		const json = await res.json();
		if (!Array.isArray(json)) {
			glog.error(`Failed to get tags from ${repo} (body is not array)`);
			continue;
		}
		const gtVersions = json.slice(0, 40);
		for (let i = 0; i < gtVersions.length; i++) {
			const version = semver.clean(gtVersions[i].name, { loose: true });
			versions.set(version, {
				repo: `${repoSplit[1]}/${repoSplit[2]}`,
				count: i,
				hasVulnerability: hasVulnerability(repo, version),
			});
		}
		versionOutput[repo] = gtVersions.map(tag => tag.name);
		glog(repo, "Finish", json.length);
	}

	const ghHeaders = {
		"User-Agent": ua,
		Authorization: `bearer ${process.env.LB_TOKEN}`
	};

	for (const repo of ghRepos) {
		glog("GitHub", repo, "Start")
		const res1 = await fetch(`https://api.github.com/repos/${repo}/releases`, { headers: ghHeaders })
		const link = res1.headers.get("link")
		const max = link && Math.min(Number(maxRegExp.exec(link)[1]), repo === "misskey-dev/misskey" ? 99999 : 4)
	}

	glog("Got Misskey Versions")
	return { versions, versionOutput }
}

export const getInstancesInfos = async function () {
	glog("Getting Instances' Infos")

	const promises = [];
	const alives = [];
	const deads = [];
	const outdated = [];

	const { versions, versionOutput } = await getVersions()

	// eslint-disable-next-line no-restricted-syntax
	for (let t = 0; t < instances.length; t += 1) {
		const instance = instances[t]
		promises.push(pqueue.add(async () => {
			const nodeinfo = (await safeGetNodeInfo(instance.url)) || null;

			if (!nodeinfo) {
				deads.push(extend(true, { isAlive: false, value: 0 }, instance));
				return;
			}

			const versionInfo = (() => {
				const sem1 = semver.clean(nodeinfo.software.version, { loose: true })
				if (versions.has(sem1)) return { just: true, ...versions.get(sem1) };
				const sem2 = semver.valid(semver.coerce(nodeinfo.software.version))
				let current = { repo: 'misskey-dev/misskey', count: 1500 };
				for (const [key, value] of versions.entries()) {
					if (sem1?.startsWith(key)) {
						if (value.count === 0) return { just: false, ...value };
						else if (current.count >= value.count) current = { just: false, ...value };
					} else if (sem2 && value.repo == 'misskey-dev/misskey' && sem2.startsWith(key)) {
						if (value.count === 0) return { just: false, ...value };
						else if (current.count >= value.count) current = { just: false, ...value };
					}
				}
				return current
			})()

			if (versionInfo.just && versionInfo.hasVulnerability) {
				outdated.push({
					nodeinfo,
					...instance,
				});
				return;
			};

			const meta = (await fetchJson('POST', `https://${instance.url}/api/meta`)) || null;
			const stat = (await fetchJson('POST', `https://${instance.url}/api/stats`)) || null;
			const NoteChart = (await fetchJson('POST', `https://${instance.url}/api/charts/notes`, { span: "day", limit: 15 })) || null;

			if (nodeinfo && meta && stat && NoteChart) {
				if (meta) {
					delete meta.emojis;
					delete meta.announcements;
				}

				/*   インスタンスバリューの算出   */
				let value = 0
				// 1. バージョンのリリース順をもとに並び替え
				value += 100000 - (versionInfo.count - 30) * 7200

				// (基準値に影響があるかないか程度に色々な値を考慮する)
				if (NoteChart && Array.isArray(NoteChart.local?.inc)) {
					// 2.
					const arr = NoteChart.local?.inc.filter(e => e !== 0)

					// ノート増加数の15日間の平均 * 1
					// eslint-disable-next-line no-mixed-operators
					if (arr.length > 0) value += (arr.reduce((prev, current) => prev + current) / arr.length);

					// もし統計の数が15日に満たない場合、新規インスタンス特典を付与
					// value += (15 - arr.length) * 360
				}

				alives.push(extend(true, instance, {
					value,
					meta,
					nodeinfo,
					stats: stat,
					name: instance.name || nodeinfo.metadata.nodeName || meta.name || instance.url,
					description: nodeinfo.metadata.nodeDescription || meta.description || (instance.description || null),
					langs: instance.langs || ['ja', 'en', 'de', 'fr', 'zh', 'ko', 'ru', 'th', 'es'],
					isAlive: true,
					repo: versionInfo?.repo
				}))
			} else {
				deads.push(extend(true, { isAlive: false, value: 0 }, instance))
			}
		}));
	}

	const interval = setInterval(() => {
		glog(`${pqueue.getQueueLength()} requests remain and ${pqueue.getPendingLength()} requests processing.`)
	}, 1000)

	await Promise.all(promises);

	clearInterval(interval)

	glog("Got Instances' Infos")

	return {
		alives: alives.sort((a, b) => (b.value || 0) - (a.value || 0)),
		deads,
		outdated,
		versions,
		versionOutput,
	}
}
