import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="auth-page">
      <div className="auth-page-intro">
        <span className="auth-page-mark" aria-hidden="true">
          L
        </span>
        <p className="arena-kicker">Start comparing</p>
        <h1>Make the workbench yours.</h1>
        <p>
          Create an account to save threads, return to your prompts, and build a record
          over time.
        </p>
      </div>
      <SignUp
        fallbackRedirectUrl="/"
        path="/sign-up"
        routing="path"
        signInUrl="/sign-in"
      />
    </main>
  );
}
