(function () {
  const HUES = [210, 152, 28, 268, 0, 330];
  fetch("books/index.json")
    .then((r) => r.json())
    .then((books) => {
      const list = document.getElementById("book-list");
      list.textContent = "";
      books.forEach((b, i) => {
        const hue = HUES[i % HUES.length];
        const card = document.createElement("a");
        card.className = "book-card";
        card.href = `reader.html#${b.id}`;
        card.innerHTML =
          `<div class="book-cover" style="background:linear-gradient(135deg,hsl(${hue},45%,32%),hsl(${hue},55%,18%))">` +
          `<span class="book-cover-title">${b.title}</span></div>` +
          `<div class="book-info"><h3>${b.title}</h3><p>${b.description || ""}</p></div>`;
        list.appendChild(card);
      });
      if (!books.length) list.innerHTML = '<p class="loading">书架为空。</p>';
    })
    .catch(() => {
      document.getElementById("book-list").innerHTML =
        '<p class="loading">书籍清单加载失败。</p>';
    });
})();
