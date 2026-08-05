import { redirect } from "next/navigation";

// middleware sends logged in users to their role home.
// this is the fallback so "/" is never a blank page.
export default function HomePage() {
  redirect("/login");
}
