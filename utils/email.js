const sgMail = require("@sendgrid/mail");
require("dotenv").config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY); // or SENDGRID_API_KEY if renamed

module.exports = class Email {
  constructor(user, url) {
    this.to = user.email;
    this.firstName = user.name.split(" ")[0];
    this.url = url;
    this.from = `Turjuman <elbohym33@gmail.com>`;
  }

  async send(templateId, data) {
    try {
      const msg = {
        to: this.to,
        from: this.from,
        templateId,
        dynamic_template_data: data,
      };

      await sgMail.send(msg);
      console.log(`Email with template ${templateId} sent successfully!`);
    } catch (error) {
      console.error("SendGrid API failed:", error.response?.body || error);
      throw error;
    }
  }
  // Email Verification 🔔
  async sendVerificationEmail() {
    try {
      const msg = {
        to: this.to,
        from: this.from,
        subject: "Verify your Turjuman account",
        html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.7; color: #000000; text-align: center; padding: 40px; background-color: #ffffff; border-radius: 12px; max-width: 650px; margin: auto;">
          <h2 style="color: #000000; font-size: 28px; margin-bottom: 20px;">Welcome, ${this.firstName}! 👋</h2>

          <p style="font-size: 18px; margin-bottom: 20px;">
             Thank you for signing up to <strong style="color: #000000;">Turjuman</strong>! 🎉
          </p>

          <p style="font-size: 16px; margin-bottom: 30px;">
             Please confirm your email address by clicking the button below 📧:
          </p>

          <a href="${this.url}" target="_blank" style="background-color:rgba(0, 87, 179, 0.93); color: #ffffff; padding: 14px 30px; text-decoration: none; font-size: 16px; border-radius: 8px; display: inline-block; margin-bottom: 25px;">
             Verify Email ✅
          </a>

          <p style="font-size: 14px; margin-top: 30px;">
             This link will expire in <strong>10 minutes ⏰</strong>.
          </p>

          <p style="font-size: 13px; color: #555555; margin-top: 10px;">
             If you did not sign up, you can safely ignore this email. 🙈
          </p>

          <hr style="margin: 40px 0; border: none; border-top: 1px solid #cccccc;">

          <p style="font-size: 12px; color: #999999;">
            &copy; 2025 Turjuman. All rights reserved.
          </p>
        </div>
`,
      };

      await sgMail.send(msg);
      console.log(`Verification email sent successfully to ${this.to}!`);
    } catch (error) {
      console.error(
        "Failed to send verification email:",
        error.response?.body || error
      );
      throw error;
    }
  }

  // async sendPasswordReset() {
  //   await this.send("d-0d8fe808f3e24fa28007e730bb526b47", {
  //     first_name: this.firstName,
  //     url: this.url,
  //     unsubscribe: `https://turjuman.vercel.app/unsubscribe?email=${this.to}`,
  //     unsubscribe_preferences: "https://turjuman.vercel.app/preferences",
  //   });
  // }

  // async sendWelcome() {
  //   await this.send("d-3f1136812d5d4f5aac4322f05a8a89d8", {
  //     first_name: this.firstName,
  //     url: this.url,
  //     unsubscribe: `https://turjuman.vercel.app/unsubscribe?email=${this.to}`,
  //     unsubscribe_preferences: "https://turjuman.vercel.app/preferences",
  //   });
  // }
};
