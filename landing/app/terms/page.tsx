import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Glowlytics Terms of Service.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen" style={{ background: "#fff", color: "#1a2b3c" }}>
      <div className="max-w-[680px] mx-auto px-6 py-10 leading-relaxed">
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Terms of Service</h1>
        <p style={{ color: "#7a8f9e", marginBottom: 32, fontSize: 14 }}>
          Last updated: March 22, 2026
        </p>

        <h2 style={h2Style}>1. Acceptance of Terms</h2>
        <p style={pStyle}>
          By accessing or using Glowlytics (&quot;the Service&quot;), you agree to be bound by
          these Terms of Service. If you do not agree, do not use the Service.
        </p>

        <h2 style={h2Style}>2. Description of Service</h2>
        <p style={pStyle}>
          Glowlytics provides AI-powered skin health tracking for informational purposes only. It
          is not a medical device and does not provide medical diagnoses, treatment
          recommendations, or clinical advice.
        </p>

        <h2 style={h2Style}>3. Medical Disclaimer</h2>
        <p style={pStyle}>
          Glowlytics is a wellness tool, not a substitute for professional medical advice. Always
          consult a qualified dermatologist or healthcare provider for medical concerns. Never
          disregard professional medical advice because of information provided by the Service.
        </p>

        <h2 style={h2Style}>4. User Accounts</h2>
        <p style={pStyle}>
          You are responsible for maintaining the confidentiality of your account credentials and
          for all activities under your account.
        </p>

        <h2 style={h2Style}>5. Privacy</h2>
        <p style={pStyle}>
          Your use of the Service is governed by our{" "}
          <a href="/privacy" style={linkStyle}>
            Privacy Policy
          </a>
          . Photos are processed for analysis and not stored beyond the session unless you
          explicitly save them.
        </p>

        <h2 style={h2Style}>6. Intellectual Property</h2>
        <p style={pStyle}>
          All content, features, and functionality of the Service are owned by BDQ Holdings LLC
          and are protected by copyright, trademark, and other intellectual property laws.
        </p>

        <h2 style={h2Style}>7. Limitation of Liability</h2>
        <p style={pStyle}>
          To the fullest extent permitted by law, BDQ Holdings LLC shall not be liable for any
          indirect, incidental, special, consequential, or punitive damages arising out of your
          use of the Service.
        </p>

        <h2 style={h2Style}>8. Changes to Terms</h2>
        <p style={pStyle}>
          We reserve the right to modify these terms at any time. Continued use of the Service
          after changes constitutes acceptance of the revised terms.
        </p>

        <h2 style={h2Style}>9. Contact</h2>
        <p style={pStyle}>
          Questions about these terms? Contact us at{" "}
          <a href="mailto:drmustafa@bdqholdings.com" style={linkStyle}>
            drmustafa@bdqholdings.com
          </a>
          .
        </p>

        <a
          href="/"
          style={{ display: "inline-block", marginTop: 32, color: "#7a8f9e", fontSize: 14 }}
        >
          &larr; Back to Glowlytics
        </a>
      </div>
    </div>
  );
}

const h2Style: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  marginTop: 32,
  marginBottom: 8,
};

const pStyle: React.CSSProperties = {
  marginBottom: 16,
};

const linkStyle: React.CSSProperties = {
  color: "#8A6FE8",
};
