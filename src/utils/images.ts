import imageCompression from 'browser-image-compression';

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
};

export async function compressPhoto(file: File): Promise<{ file: File; preview: string }> {
  const compressedBlob = await imageCompression(file, {
    maxSizeMB: 0.8,
    maxWidthOrHeight: 1280,
    useWebWorker: true,
    fileType: 'image/jpeg',
    initialQuality: 0.78,
  });
  const compressedFile = new File(
    [compressedBlob],
    file.name.replace(/\.[^.]+$/, '.jpg'),
    { type: 'image/jpeg', lastModified: Date.now() },
  );

  return {
    file: compressedFile,
    preview: await fileToDataUrl(compressedFile),
  };
}
