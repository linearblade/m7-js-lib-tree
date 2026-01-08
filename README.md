# m7-js-lib v0.98 (Legacy)

⚠️ **Legacy / Backwards Compatibility Notice**

This package (`v0.98`) exists **only for backwards compatibility** with older projects.
It is **no longer being actively maintained**.

Some functionality was tied to the **original bootstrapper**, which has since been fully re-implemented as **[m7BootStrap](./vendor/m7Bootstrap/README.md)**.
If you’re starting new work, **use m7BootStrap instead** — it provides modern APIs, dependency resolution, lifecycle hooks, and long-term support.

---

## ✅ Status

* Fully **battle-tested and production capable** — this library has been deployed in production for over **20 years**.
* However, some APIs are now redundant when combined with `m7BootStrap`. In most cases, it will serve little to no purpose outside of legacy environments.

---

## 📦 Usage

You can still use this as a load package with `m7BootStrap`:

```js
await bootstrap.load(
  "/vendor/m7-js-lib-098/src/package.json",
  { hooks: true }
);
```

Or simply import it as a module:

```js
import lib from "/vendor/m7-js-lib-098/src/lib098.js";
```

---

## 🔗 Migration

For modern projects, migrate to:

* **[m7BootStrap →](https://github.com/linearblade/m7BootStrap)** – runtime package management & loader
* **[m7Fetch →](https://github.com/linearblade/m7Fetch)** – network and asset fetching system

---

## 📜 License

See [`LICENSE.md`](LICENSE.md) for full terms.
Free for personal, non-commercial use.
Commercial licensing available under the M7 Moderate Team License (MTL-10).

## 💼 **Integration & Support**

If you’re interested in using M7BootStrap in a commercial project or need assistance with integration,
support contracts and consulting are available. Contact [legal@m7.org](mailto:legal@m7.org) for details.

---

## 🤖 AI Usage Disclosure

See [`docs/AI_DISCLOSURE.md`](docs/AI_DISCLOSURE.md) and [`docs/USE_POLICY.md`](docs/USE_POLICY.md)
for permitted use of AI in derivative tools or automation layers.

---

## 📬 Contact

**Author & Maintainer:** M7 Development Team

**Website:** [https://m7.org](https://m7.org)

**Email:** [support@m7.org](mailto:support@m7.org)

**Legal:** [legal@m7.org](mailto:legal@m7.org)

**GitHub:** [https://github.com/m7org](https://github.com/linearblade)

**General inquiries:** [legal@m7.org](mailto:legal@m7.org)

**Security issues:**  [security@m7.org](mailto:security@m7.org)
