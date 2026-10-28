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

    // 데모 연결 상태: 브라우저의 온라인/오프라인을 따름 (리허설에서 비행기 모드로 확인 가능)
    let connected = navigator.onLine !== false;
    const connCbs = new Set();
    const setConn = (v) => { connected = v; connCbs.forEach((cb) => cb(v)); };
    window.addEventListener("online", () => setConn(true));
    window.addEventListener("offline", () => setConn(false));

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
      onConnection(cb) { connCbs.add(cb); cb(connected); return () => connCbs.delete(cb); },
      get connected() { return connected; },
      refresh() { listeners.forEach((l) => (l.last = undefined)); fire(); setTimeout(() => setConn(navigator.onLine !== false), 300); },
      async vote(cid) {
        if (!connected) throw new Error("offline");
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

    // 서버와 실제로 연결돼 있는지 (.info/connected)
    let connected = false;
    const connCbs = new Set();
    db.ref(".info/connected").on("value", (s) => {
      connected = s.val() === true;
      connCbs.forEach((cb) => cb(connected));
    });

    return {
      mode: "firebase",
      onConnection(cb) { connCbs.add(cb); cb(connected); return () => connCbs.delete(cb); },
      get connected() { return connected; },
      // 다른 앱에 갔다 돌아왔을 때: 연결을 새로 맺어 최신 상태를 다시 받음
      refresh() { db.goOffline(); db.goOnline(); },
      async init(opts = {}) {
        if (opts.anonymous) {
          // 저장된 로그인부터 복원한 뒤, 아무 계정도 없을 때만 익명 로그인
          // (같은 브라우저의 진행자 구글 로그인을 익명 계정으로 덮어쓰지 않도록)
          const restored = await new Promise((resolve) => {
            const off = auth.onAuthStateChanged((u) => { off(); resolve(u); });
          });
          if (!restored) await auth.signInAnonymously();
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
      // 결과: 성공이면 그대로 끝, 실패면 이유를 담은 오류
      //   offline = 연결이 끊긴 상태 / already = 이미 투표함 / closed = 그 무대 투표가 끝남 / error = 그 밖의 실패
      async vote(cid) {
        const uid = auth.currentUser && auth.currentUser.uid;
        if (!uid || !connected) throw new Error("offline"); // 끊긴 상태에서는 표를 쌓아 두지 않음
        const mine = ref(`votes/${cid}/${uid}`);
        try {
          await mine.set(Date.now());
          return;
        } catch (e) {}
        // 서버가 거절함 → 서버의 지금 상태로 이유를 다시 확인
        let snapMine, snapState;
        try {
          [snapMine, snapState] = await Promise.all([mine.get(), ref("state").get()]);
        } catch (e) {
          throw new Error("offline");
        }
        if (snapMine.exists()) throw new Error("already");
        const st = snapState.val() || {};
        if (st.phase === "open" && st.currentId === cid) {
          // 아직 이 무대 투표 중 → 한 번 더 보냄
          try {
            await mine.set(Date.now());
            return;
          } catch (e) {
            const again = await mine.get().catch(() => null);
            throw new Error(again && again.exists() ? "already" : "error");
          }
        }
        throw new Error("closed");
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
