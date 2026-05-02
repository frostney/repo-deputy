import { createSocialImage } from "./_components/social-image";

export const alt = "Repo Deputy whole-repository drift scanner";
export const contentType = "image/png";
export const runtime = "nodejs";
export const size = {
  width: 1200,
  height: 630,
};

export default function Image() {
  return createSocialImage({ variant: "twitter" });
}
