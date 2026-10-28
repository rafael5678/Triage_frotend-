/** Reduce la foto a máx. 1024 px y JPEG para que viaje liviana a la IA (unos cientos de KB). */
export function resizePhoto(file, maxSide = 1024, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith("image/")) {
      reject(new Error("El archivo no es una imagen."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la foto."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("No se pudo abrir la foto."));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({ dataUrl: canvas.toDataURL("image/jpeg", quality), mime: "image/jpeg", name: file.name });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
