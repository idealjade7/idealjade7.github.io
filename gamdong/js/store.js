// 데이터 저장소 — Firebase 실시간 데이터베이스 또는 데모(브라우저 탭 간 연동)
(function () {
  const CFG = window.GAMDONG_CONFIG || { firebase: {} };
  const isDemo = !(CFG.firebase && CFG.firebase.apiKey);

  const split = (p) => p.split("/").filter(Boolean);
  const newId = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function voteUrl() {
    if (CFG.voteUrl) return CFG.voteUrl;
    const u = new URL("index.html", location.href);
    u.search = "";
    u.hash = "";
    return u.toString();
  }

  // ---------------------------------------------------------- 데모 백엔드
  function DemoBackend() {
    const KEY = "gamdong-demo-v1";
    const chan = "BroadcastChannel" in window ? new BroadcastChannel(KEY) : null;
    const listeners = new Set();
    let uid = sessionStorage.getItem(KEY + "-uid");
    if (!uid) {
      uid = "demo-" + newId();
      sessionStorage.setItem(KEY + "-uid", uid);
    }

    const load = () => {
      try {
        return JSON.parse(localStorage.getItem(KEY)) || {};
      } catch (e) {
        return {};
      }
    };
    const get = (tree, path) =>
      split(path).reduce((n, k) => (n == null ? null : n[k] ?? null), tree);

    function fire() {
      const tree = load();
      listeners.forEach((l) => {
        const v = get(tree, l.path);
        const s = JSON.stringify(v);
        if (s !== l.last) {
          l.last = s;
          l.cb(v == null ? null : JSON.parse(s));
        }
      });
    }
    function mutate(fn) {
      const tree = load();
      fn(tree);
      localStorage.setItem(KEY, JSON.stringify(tree));
      if (chan) chan.postMessage("x");
      fire();
    }
    function setIn(tree, path, val) {
      const ks = split(path);
      let n = tree;
      ks.slice(0, -1).forEach((k) => {
        if (typeof n[k] !== "object" || n[k] === null) n[k] = {};
        n = n[k];
      });
      const last = ks[ks.length - 1];
      if (val === null || val === undefined) delete n[last];
      else n[last] = val;
    }
    if (chan) chan.onmessage = fire;
    window.addEventListener("storage", (e) => e.key === KEY && fire());

    return {
      mode: "demo",
      init: async () => ({ uid }),
      onAuth: (cb) => cb({ email: "데모 진행자", isAdmin: true }),
      adminSignIn: async () => {},
      adminSignOut: async () => {},
      on(path, cb) {
        const l = { path, cb, last: undefined };
        listeners.add(l);
        setTimeout(fire, 0);
        return () => listeners.delete(l);
      },
      set: async (path, val) => mutate((t) => setIn(t, path, val)),
      update: async (path, obj) =>
        mutate((t) =>
          Object.entries(obj).forEach(([k, v]) =>
            setIn(t, path.replace(/\/$/, "") + "/" + k, v)
          )
        ),
      remove: async (path) => mutate((t) => setIn(t, path, null)),
      async vote(cid) {
        const t = load();
        const st = t.state || {};
        if (st.phase !== "open" || st.currentId !== cid)
          throw new Error("closed");
        if (get(t, `votes/${cid}/${uid}`)) throw new Error("already");
        mutate((tt) => setIn(tt, `votes/${cid}/${uid}`, Date.now()));
      },
      join: async () => {
        mutate((t) => setIn(t, `presence/${uid}`, Date.now()));
        window.addEventListener("pagehide", () =>
          mutate((t) => setIn(t, `presence/${uid}`, null))
        );
      },
      resetDemo() {
        localStorage.removeItem(KEY);
        if (chan) chan.postMessage("x");
        fire();
      },
      get uid() {
        return uid;
      }
    };
  }

  // ---------------------------------------------------------- Firebase 백엔드
  function FirebaseBackend() {
    firebase.initializeApp(CFG.firebase);
    const db = firebase.database();
    const auth = firebase.auth();
    const ref = (p) => db.ref(p);
    const isAdmin = (u) =>
      !!u &&
      !!u.email &&
      u.email.toLowerCase() === String(CFG.adminEmail || "").toLowerCase();

    return {
      mode: "firebase",
      async init(opts = {}) {
        if (opts.anonymous) {
          if (!auth.currentUser) await auth.signInAnonymously();
          return { uid: auth.currentUser.uid };
        }
        return { uid: null };
      },
      onAuth(cb) {
        auth.onAuthStateChanged((u) =>
          cb(u && !u.isAnonymous ? { email: u.email, isAdmin: isAdmin(u) } : null)
        );
      },
      adminSignIn: () =>
        auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()),
      adminSignOut: () => auth.signOut(),
      on(path, cb) {
        const r = ref(path);
        const h = (s) => cb(s.val());
        r.on("value", h);
        return () => r.off("value", h);
      },
      set: (p, v) => ref(p).set(v),
      update: (p, o) => ref(p).update(o),
      remove: (p) => ref(p).remove(),
      async vote(cid) {
        const uid = auth.currentUser.uid;
        try {
          await ref(`votes/${cid}/${uid}`).set(Date.now());
        } catch (e) {
          const snap = await ref(`votes/${cid}/${uid}`).get().catch(() => null);
          throw new Error(snap && snap.exists() ? "already" : "closed");
        }
      },
      // 접속 중인 동안만 presence 에 남고, 연결이 끊기면 서버가 자동으로 지움
      join() {
        const uid = auth.currentUser && auth.currentUser.uid;
        if (!uid) return;
        const me = ref(`presence/${uid}`);
        ref(".info/connected").on("value", (s) => {
          if (s.val() !== true) return;
          me.onDisconnect().remove().then(() => me.set(Date.now())).catch(() => {});
        });
      },
      get uid() {
        return auth.currentUser && auth.currentUser.uid;
      }
    };
  }

  const backend = isDemo ? DemoBackend() : FirebaseBackend();
  backend.newId = newId;
  backend.voteUrl = voteUrl;
  backend.isDemo = isDemo;
  window.GD = backend;
})();
