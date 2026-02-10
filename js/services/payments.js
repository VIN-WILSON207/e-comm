import { db } from "../firebase.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

/**
 * Payment Service (Simulated)
 */
export const PaymentService = {
  /**
   * Initiates a simulated mobile money payment (STK Push).
   * @param {string} orderId 
   * @param {number} amount 
   * @param {string} phone 
   * @param {'mtn'|'orange'} provider 
   * @returns {Promise<{success: boolean, referenceId: string, message: string}>}
   */
  async initiatePayment(orderId, amount, phone, provider) {
    console.log(`[PaymentService] Initiating ${provider} payment for order ${orderId}...`);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Simulate STK Push acceptance
    const referenceId = `TXN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    return {
      success: true,
      referenceId: referenceId,
      message: `STK Push sent to ${phone}. Please enter your PIN.`
    };
  },

  /**
   * Polls for payment status (Simulated).
   * @param {string} referenceId 
   * @returns {Promise<string>} 'SUCCESSFUL' | 'FAILED' | 'PENDING'
   */
  async pollPaymentStatus(referenceId) {
    // In a real app, we'd call an API. Here we simulate success after 2 polls.
    await new Promise(resolve => setTimeout(resolve, 2000));
    return 'SUCCESSFUL';
  }
};
