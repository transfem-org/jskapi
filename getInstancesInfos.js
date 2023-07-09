import semver from "semver";
import AbortController from "abort-controller";
import extend from "extend";
import loadyaml from "./loadyaml.js";
import Queue from "promise-queue";
import { performance } from "perf_hooks";
import fetch from "node-fetch";

const instances = loadyaml("./data/instances.yml");

const pqueue = new Queue(128);

const ua =
  "CalckeyOrg/0.1.0; +https://calckey.org/join";

function safeFetch(
  method,
  url,
  options
) /*: Promise<Response | null | false | undefined>*/ {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 30000);
  const start = performance.now();
  return fetch(
    url,
    extend(true, options, { method, signal: controller.signal })
  )
    .then(
      (res) => {
        if (res?.ok) {
          const end = performance.now();
          if (end - start > 1000) {
            console.warn("POST slow", url, (end - start) / 1000);
          }
          return res;
        }
        console.log("POST finish", url, res.status, res.ok);
        if (res.status >= 500 && res.status < 600) return null;
      },
      async (e) => {
        console.log("POST failed...", url, e.errno, e.type);
        if (e.message?.toLowerCase().includes("timeout") || e.type === "aborted")
          return null;
        return false;
      }
    )
    .finally(() => {
      clearTimeout(timeout);
    });
}

async function fetchJson(method, url, json) {
  const option = {
    body: JSON.stringify(json ? json : {}),
    headers: {
      "Content-Type": "application/json",
      "User-Agent":
        "CalckeyOrg/0.1.0; +https://calckey.org/join",
    },
    redirect: "error",
  };

  let retryCount = 0;

  while (retryCount < 2) {
    if (retryCount > 0) console.log("retry", url, retryCount);
    await new Promise((resolve) =>
      retryCount > 0 ? setTimeout(resolve, 10000) : resolve()
    );
    const res = await safeFetch(method, url, option)
      .then((res) => {
        if (res === null) return null;
        if (!res) return false;
        return res.json();
      })
      .catch((e) => {
        console.error(url, e);
        return false;
      });

    if (res === false) return false;
    if (res !== null) return res;
    retryCount += 1;
    console.log("retry", url, retryCount);
  }
  return false;
}

async function getNodeinfo(
  base
) /*: Promise<Response | null | false | undefined>*/ {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 30000);

  const wellnownUrl = `https://${base}/.well-known/nodeinfo`;

  const wellknown = await fetch(wellnownUrl, {
    method: "GET",
    headers: {
      "User-Agent": ua,
    },
    redirect: "error",
    signal: controller.signal,
  })
    .then((res) => {
      if (res?.ok) {
        console.log(
          "Get WellKnown Nodeinfo finish",
          wellnownUrl,
          res.status,
          res.ok
        );
        return res.json();
      }
      return;
    })
    .catch(async (e) => {
      console.log(
        "Get WellKnown Nodeinfo failed...",
        wellnownUrl,
        e.errno,
        e.type
      );
      return;
    })
    .finally(() => {
      clearTimeout(timeout);
    });

  if (wellknown.links == null || !Array.isArray(wellknown.links)) {
    console.log("WellKnown Nodeinfo was Not Array", wellnownUrl, wellknown);
    return null;
  }

  const links = wellknown.links;

  const lnik1_0 = links.find(
    (link) => link.rel === "http://nodeinfo.diaspora.software/ns/schema/1.0"
  );
  const lnik2_0 = links.find(
    (link) => link.rel === "http://nodeinfo.diaspora.software/ns/schema/2.0"
  );
  const lnik2_1 = links.find(
    (link) => link.rel === "http://nodeinfo.diaspora.software/ns/schema/2.1"
  );
  const link = lnik2_1 ?? lnik2_0 ?? lnik1_0;

  if (link == null || typeof link !== "object") {
    console.log("Nodeinfo Link was Null", wellnownUrl);
    return null;
  }

  const controller2 = new AbortController();
  const timeout2 = setTimeout(() => {
    controller2.abort();
  }, 30000);

  const info = await fetch(link.href, {
    method: "GET",
    headers: {
      "User-Agent": ua,
    },
    redirect: "error",
    signal: controller2.signal,
  })
    .then((res) => {
      if (res?.ok) {
        console.log("Get Nodeinfo finish", link.href, res.status, res.ok);
        return res.json();
      }
      return;
    })
    .catch(async (e) => {
      console.log("Get Nodeinfo failed...", link.href, e.errno, e.type);
      if (e.message?.toLowerCase().includes("timeout") || e.type === "aborted")
        return null;
      return;
    })
    .finally(() => {
      clearTimeout(timeout2);
    });

  return info;
}

async function safeGetNodeInfo(base) {
  const retry = (timeout) =>
    new Promise((res, rej) => {
      setTimeout(() => {
        getNodeinfo(base).then(res, rej);
      }, timeout);
    });
  return getNodeinfo(base)
    .then((res) => (res === undefined ? retry(10000) : res))
    .catch((e) => retry(10000))
    .catch(() => null);
}

export const getInstancesInfos = async function () {
  console.log("Getting Instances' Infos");

  const promises = [];
  const alives = [];
  const deads = [];

  // eslint-disable-next-line no-restricted-syntax
  for (let t = 0; t < instances.length; t += 1) {
    const instance = instances[t];
    promises.push(
      pqueue.add(async () => {
        const nodeinfo = (await safeGetNodeInfo(instance.url)) || null;

        if (!nodeinfo) {
          deads.push(extend(true, { isAlive: false }, instance));
          return;
        }

        const meta =
          (await fetchJson("POST", `https://${instance.url}/api/meta`)) || null;
        const stat =
          (await fetchJson("POST", `https://${instance.url}/api/stats`)) ||
          null;
        const NoteChart =
          (await fetchJson("POST", `https://${instance.url}/api/charts/notes`, {
            span: "day",
            limit: 15,
          })) || null;

        if (nodeinfo && stat && meta && NoteChart) {
          if (meta) {
            delete meta.emojis;
            delete meta.announcements;
          }

          alives.push(
            extend(true, instance, {
              meta,
              nodeinfo,
              name:
                instance.name ||
                nodeinfo.metadata.nodeName ||
                meta.name ||
                instance.url,
              description:
                nodeinfo.metadata.nodeDescription ||
                meta.description ||
                instance.description ||
                null,
              stats: stat,
              langs: instance.langs || [
                "ja",
                "en",
                "de",
                "fr",
                "zh",
                "ko",
                "ru",
                "th",
                "es",
              ],
              isAlive: true,
            })
          );
        } else {
          deads.push(extend(true, { isAlive: false }, instance));
        }
      })
    );
  }

  const interval = setInterval(() => {
    console.log(
      `${pqueue.getQueueLength()} requests remain and ${pqueue.getPendingLength()} requests processing.`
    );
  }, 1000);

  await Promise.all(promises);

  clearInterval(interval);

  console.log("Got Instances' Infos");

  return {
    alives,
    deads,
  };
};
