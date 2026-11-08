/** Roving focus for the visible file tree. Opening a file remains an explicit Enter/click. */
export function installFileTreeKeyboard(
  container,
  { collapse, expand, rename, trash },
) {
  const items = () =>
    [...container.querySelectorAll("[data-tree-item]")].filter(
      (el) => !el.hidden,
    );
  const focus = (el) => {
    if (!el) return;
    items().forEach((item) => {
      item.tabIndex = item === el ? 0 : -1;
    });
    el.focus();
    el.scrollIntoView({ block: "nearest" });
  };
  let prefix = "",
    typedAt = 0;
  const initial =
    items().find((el) => el.classList.contains("selected")) ||
    items().find((el) => el.classList.contains("current")) ||
    items()[0];
  items().forEach((el) => {
    el.tabIndex = el === initial ? 0 : -1;
  });
  container.onfocusin = (event) => {
    if (event.target.matches("[data-tree-item]"))
      items().forEach((item) => {
        item.tabIndex = item === event.target ? 0 : -1;
      });
  };
  container.onkeydown = (event) => {
    const active = event.target.closest("[data-tree-item]");
    if (
      !active ||
      event.isComposing ||
      event.key === "Process" ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    const visible = items(),
      at = visible.indexOf(active);
    const directory = active.dataset.directory === "true";
    const path = active.dataset.path;
    const parent = () =>
      visible.find(
        (el) => el.dataset.path === path.replace(/[\\/][^\\/]+$/, ""),
      );
    switch (event.key) {
      case "ArrowDown":
        focus(visible[Math.min(at + 1, visible.length - 1)]);
        break;
      case "ArrowUp":
        focus(visible[Math.max(at - 1, 0)]);
        break;
      case "Home":
        focus(visible[0]);
        break;
      case "End":
        focus(visible.at(-1));
        break;
      case "ArrowRight":
        if (directory && active.getAttribute("aria-expanded") === "false")
          expand(path);
        else if (
          directory &&
          Number(visible[at + 1]?.getAttribute("aria-level")) >
            Number(active.getAttribute("aria-level"))
        )
          focus(visible[at + 1]);
        break;
      case "ArrowLeft":
        if (directory && active.getAttribute("aria-expanded") === "true")
          collapse(path);
        else focus(parent());
        break;
      case "F2":
        rename(path, directory);
        break;
      case "Delete":
        trash(path, directory);
        break;
      default:
        if (event.key.length !== 1 || event.key === " ") return;
        prefix = Date.now() - typedAt < 750 ? prefix + event.key : event.key;
        typedAt = Date.now();
        focus(
          [...visible.slice(at + 1), ...visible.slice(0, at + 1)].find((el) =>
            el.textContent
              .trim()
              .toLocaleLowerCase()
              .startsWith(prefix.toLocaleLowerCase()),
          ),
        );
        break;
    }
    event.preventDefault();
    event.stopPropagation();
  };
}
