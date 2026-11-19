// The BSB marks the plural "you" as you+ / your+ / yours+. Show the + small and raised.
export function setVerseText(element, text) {
  element.textContent = "";
  String(text ?? "")
    .split(/([A-Za-z])\+/)
    .forEach((part, index) => {
      element.append(part);
      if (index % 2 === 1) {
        const plus = document.createElement("sup");
        plus.className = "plural-you";
        plus.textContent = "+";
        plus.style.fontSize = "0.7em";
        plus.style.lineHeight = "0";
        element.append(plus);
      }
    });
}
