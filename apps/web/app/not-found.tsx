import Link from "next/link";

export default function NotFound() {
  return (
    <main className="standalone">
      <h1>This research view is unavailable</h1>
      <p>
        Open the investigation catalog to continue exploring the current
        evidence.
      </p>
      <Link href="/app/investigations">Explore investigations</Link>
    </main>
  );
}
