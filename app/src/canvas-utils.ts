const ThreadDragImage = document.createElement('img');
ThreadDragImage.src = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAJc0lEQVR42u2dSW8URxTHsY0XtgQTspySKIryBRCgALZIIPkA4RL5kkMuufAVcs2VIxKCAycuCBIBYjE7GGOx72bfwg628bAYA536VfpFL+Xume6ebnvkqZb+IswMXfX+v6rXr6pnOlOCIJjiNXHyJngAHoCXB+ABeHkAHoCXB+ABeHkAHoCXB+ABeHkAHoCXB+ABeHkAdQQg5dHg9T8lPrICKNd4Yx0rNZC0AMqZ3WQ0tc7VVAFIVQDGGN/e3v7lvHnzlnZ2di6LUkdHx/LJrLi458+fv3Tu3LlfxYDIBGCM+Q0NDQtWrVr167Nnz3rM518F/pBjZHBwsG/NmjW/NTY2LqwEIQkA13ym2WddXV0/PX/+fMD7HX2USqXhlStXdhmvPlepaQyENADEfLTgxo0bf718+TJ48eJF8P79e++4OvAEb+7du9eNV8q3xrQA3IutXGgXmgbuvXv3LhgeHg6GhoY8BHPggckKVnjz5s2bIbyKuED/ByENADG/2ejb0dHREo28ffs2GBgYCMy1wDZarwex4wFe4Al/BwheGbU4EFIBEGpifksIYJiGzJ/ByMhI8Pjx4+Dhw4f27/V2EDOxP3r0yHrB3wVCCKA19M6FkBiAjP6W8GSLzPSyM0AAvH79Orh//35w9+5dpt6ETH+t8TTf5HorPBAAagYsMmqLmQVlAbjpR0Y/J1ssACCN4TT+6tWr4M6dO8GtW7dsR6KMyVO0X0lFtc1B3MR6+/ZtGzse8JqTghYbTQu9a3bTUFIAkn5aw5Mt0QBkFtAJKoCbN28G165dsx0q0mTarqSigBDv9evXA1MN2piJndciACwxmu6koVQAmiIAdABADNKzgPLL1MAWwOXLl23Hko7WJNLmAr6S4kBkFbEQ55UrV4KrV6/aWIlZRr9OPyGADqMZcdeBSgDc/N8W0uygCtKjlIbpgMwCylM6eenSJdvBaiGkNb4IEMRAfMTU399vY9Sj3zU/+NdIARB5HcgMQM8ADUBmgawPLl68GJw7d86OlKRpo5zZtJFVLow0ou/ERSwXLlywsRGjjH4NIGIGzMwTwIyoGSBmCQRGBguSwcFB2+nTp09bCFlMz8N8DSALBOIhhrNnz9qYiM0d/Tr3qxnQWQSATncGuAD0LGCBcurUqeD48eO242nTSLXGx0FImrqIg74TA7HI6AeAzv06xakZIAAiK6G0AKa5APQM0BWRhsCIefr0qQ3i6NGjNoCkEPI0Py0EMb+vry84duyYjYFYonK/TlW6WhoXAOUgSCpiif7kyRMbTE9Pjw0kicGcJ28lhUS/6St9pu/EwGuk0iTmFw4gqlLRpuqyFMOZvmxZHDlyJDh48KANaDwMzwKB/h46dMgCoM/0XY9+ST1R6UenIQdAa1YAzUkAuBDiUhF7JocPHw727dtnAxtP45OAoZ/79++3AOirpB658ErVU878wgGYDpTKVTEagKwNCADDmc4PHjwIDhw4EOzZs8cGWAsQ6AOzkj4BgD7SV7nwSuqJAhBXuk4IgLhZoCEwrdm8I9Du7u5xgUA/xLw48+nL3r17bd8k9Yj5uuavZP6EA4iDQCBSmgoEUtGuXbvsaNNGiWTU5SHO5Z6PNukPfWD0u+a7C64k5hcOwHSmlLSMdFORvh6wj85WLoHv2LHDBq4h5Gl+FATaoh+0zeinL/SJ16TqkZLTBZCkjJ1wAEkhcB9h9+7dwfbt28dAKEJSRtI+bTL66UNe5tcUgDQQGIUbNmywaaBICJybNmlr586duZtfOADTsVLaFagGINcDvUij6mC5v27dumDjxo22BNQpIy9xTtrbtGlTsHbt2uDEiRORFQ99dAGkXXHXFIBKENg5ZX3An+TkLVu25A5BzN+6datNPWwr0+b58+dzNb9wAKaDpWrKQQEgqYibGyz5ucvEhZC7ahiUJwQxn3Nu27bNtkFb3NWibb3H7wLIuq6oSQAuBIwgDWAGo5BczL1ljMkLgms+56YNyfu0ffLkSTsA8jC/5gEIBG5qs8+OEe71wIXAZwRaGvFvqKxIO9p82pB6n7aBfObMGft+teYXDsBM01K1lQjfJsB8Atc3cPR2RbUQKpnv7vPwGhCYlXlUWjULAPMJFKMxiQsf+TdPCGnMp23Z6+F17nxVC6FmAWjz9T5RGgisE8pB4D1ApTFfLr70KQ8IhQIwHS5luRiS86PMdwFQDnI9wAjZMxIIrFqp4SlXZbGkxWu8t3nzZgtMzJc9Hlls0YYLIA5C1gt/TQEoZ34SCDITMISKBQjMBm7wcC1Bvb29dtTzHpUVn3VHfjnz84RQUwCSmJ8EgmzekcYY2Syg2EPCcMTs4FsYvMdn2GJIa35eEGoGQBrzK0HgHFRN8kVgTOb8mIPku5q8x2f4LP8mrfl5QCgUgAmglKQMlDqfEZjUfA1BQGCcXJhlNmAuoxuj5RvK/Dev8Z6MermfK3v7Sc2PgiDrhKQl8IQCqMb8KAh6NggIRjfn15IRLz+YcKudNOZXA2FCAeRhfjkImIq5AkNLXpdRX635WSHkCWBqGgB5mu9C0CAERpTkfW18NeZngVAoABNcKaqDXKTY08d8veOZl1wQ5ZSn8S4EWTEz0NjAi/tcYV/MigJQtPnlYESpyLaTQCgCQFscgPE2vxZUCUKRADo0gHo0PwkEB0C+P9AwDf5d7+ZXgmCKgcHCfiFjVoV/Uu3Uu/lxEKiO+vv7u0MA07MCiPuR3hfLly//ube394k3PxpCX1/f0IoVK34xXn0d8SvJpmp/psqUWrJ69erfzYLnvml8tN7NVxo1C8BH69ev/yPM/zOcNcDULL8Tdn+oDdFZId3vjL43Wmb0g9KPdSId87LQCzz5JvRIp59UP9SeEvOgDj0LaOBDo3ajj4zmGn0S6tM6kcT7cehBe+jJLGf0t1TzrAj3YR0yC2YqCLPDxueEHREgk1kS55ww9tnK/JkRoz8TgLhZIBBkJnwQNq5h1INmK+M/UCNfzI97UkpqAHEQpikQMiNmKSiTXbPUiBfjp5UxPxWAuEeW6XSkQQgMAVIvmh5hvJt2Mj2yLO6hfS4EASEw2hwok1U61lZlfCXzUwGYEvOwVv2g1mallhi1ThLFxac9mFom7aR+bGU5CO6McNU8yRX39NymJObn/ejiRqfxelSlZ0n7h3dPwIO7c314t398/Xg9vt7L/x80PAAvD8AD8PIAPAAvD8AD8PIAPAAvD8AD8CpO/wAnnXiPa3zSAAAAAABJRU5ErkJggg==`;

const ContactDragImage = document.createElement('img');
ContactDragImage.src = ` data:image/png;base64,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`;

const DragCanvas = document.createElement('canvas');
DragCanvas.style.position = 'absolute';
DragCanvas.style.zIndex = '0';
DragCanvas.style.top = '0';
document.body.appendChild(DragCanvas);

const PercentLoadedCache = {};
const PercentLoadedCanvas = document.createElement('canvas');
PercentLoadedCanvas.style.position = 'absolute';
PercentLoadedCanvas.style.zIndex = '0';
PercentLoadedCanvas.style.top = '0';
document.body.appendChild(PercentLoadedCanvas);

const SystemTrayCanvas = document.createElement('canvas');

export function roundRect(ctx, x, y, width, height, radius = 5, fill, stroke = true) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (stroke) {
    ctx.stroke();
  }
  if (fill) {
    ctx.fill();
  }
}

export function dataURIForLoadedPercent(_percent) {
  const percent = Math.floor(_percent / 5.0) * 5.0;
  const cacheKey = `${percent}%`;
  if (!PercentLoadedCache[cacheKey]) {
    const canvas = PercentLoadedCanvas;
    const scale = window.devicePixelRatio;
    canvas.width = 20 * scale;
    canvas.height = 20 * scale;
    canvas.style.width = '30px';
    canvas.style.height = '30px';

    const half = 10 * scale;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#AAA';
    ctx.lineWidth = 3 * scale;
    ctx.clearRect(0, 0, 20 * scale, 20 * scale);
    ctx.beginPath();
    ctx.arc(
      half,
      half,
      half - ctx.lineWidth,
      -0.5 * Math.PI,
      -0.5 * Math.PI + (2 * Math.PI * percent) / 100.0
    );
    ctx.stroke();
    PercentLoadedCache[cacheKey] = canvas.toDataURL();
  }
  return PercentLoadedCache[cacheKey];
}

export function canvasForDragging(type: 'threads' | 'contacts', count: number) {
  const canvas = DragCanvas;

  // Make sure the canvas has a 2x pixel density on retina displays
  const scale = window.devicePixelRatio;
  canvas.width = 58 * scale;
  canvas.height = 55 * scale;
  canvas.style.width = '58px';
  canvas.style.height = '55px';

  const ctx = canvas.getContext('2d');
  const DragImage = type === 'threads' ? ThreadDragImage : ContactDragImage;

  // mail background image
  if (count > 1) {
    ctx.rotate((-20 * Math.PI) / 180);
    ctx.drawImage(DragImage, -10 * scale, 2 * scale, 48 * scale, 48 * scale);
    ctx.rotate((20 * Math.PI) / 180);
  }
  ctx.drawImage(DragImage, 0, 0, 48 * scale, 48 * scale);

  // count bubble
  const dotGradient = ctx.createLinearGradient(0, 0, 0, 15 * scale);
  dotGradient.addColorStop(0, 'rgb(116, 124, 143)');
  dotGradient.addColorStop(1, 'rgb(67, 77, 104)');
  ctx.strokeStyle = 'rgba(39, 48, 68, 0.6)';
  ctx.lineWidth = 1;
  ctx.fillStyle = dotGradient;

  let textX = 49;
  let text = `${count}`;

  if (count < 10) {
    roundRect(ctx, 41 * scale, 1 * scale, 16 * scale, 14 * scale, 7 * scale, true, true);
  } else if (count < 100) {
    roundRect(ctx, 37 * scale, 1 * scale, 20 * scale, 14 * scale, 7 * scale, true, true);
    textX = 46;
  } else {
    roundRect(ctx, 33 * scale, 1 * scale, 25 * scale, 14 * scale, 7 * scale, true, true);
    text = '99+';
    textX = 46;
  }

  // count text
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `${11 * scale}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(text, textX * scale, 12 * scale, 30 * scale);

  return DragCanvas;
}

export function measureTextInCanvas(text, font) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  context.font = font;
  return Math.ceil(context.measureText(text).width);
}

export function canvasWithSystemTrayIconAndText(img, text) {
  const canvas = SystemTrayCanvas;
  const w = img.width;
  const h = img.height;
  const font = '26px Mailspring-Pro, sans-serif';

  const textWidth = text.length > 0 ? measureTextInCanvas(text, font) + 2 : 0;
  canvas.width = w + textWidth;
  canvas.height = h;

  const context = canvas.getContext('2d');
  context.font = font;
  context.fillStyle = 'black';
  context.textAlign = 'start';
  context.textBaseline = 'middle';

  context.drawImage(img, 0, 0);
  // Place after img, vertically aligned
  context.fillText(text, w, h / 2);
  return canvas;
}
