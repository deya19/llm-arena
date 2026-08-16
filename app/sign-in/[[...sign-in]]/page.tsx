import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="auth-page">
      <div className="auth-page-intro">
        <span className="auth-page-mark" aria-hidden="true">
          L
        </span>
        <p className="arena-kicker">Welcome back</p>
        <h1>Return to the workbench.</h1>
        <p>Sign in to keep your comparisons together and pick up where you left off.</p>
      </div>
      <SignIn
        fallbackRedirectUrl="/"
        path="/sign-in"
        routing="path"
        signUpUrl="/sign-up"
      />
    </main>
  );
}
