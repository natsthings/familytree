// Upload a file to Cloudinary using unsigned upload with a preset
// We use the unsigned method so we don't expose the API secret in the browser

export async function uploadToCloudinary(file: File, folder: string): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', 'roots_unsigned')
  formData.append('folder', folder)

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/dcydllmxa/image/upload`,
    { method: 'POST', body: formData }
  )

  if (!response.ok) {
    const err = await response.json()
    throw new Error(err.error?.message ?? 'Upload failed')
  }

  const data = await response.json()
  return data.secure_url
}
