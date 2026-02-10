import { db, auth } from "../firebase.js";
import { doc, getDoc, updateDoc, collection, addDoc, serverTimestamp, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { showToast } from "../utils.js";

/**
 * Order Service
 */
export const OrderService = {
     /**
      * Generates a 6-digit delivery OTP.
      */
     generateOTP() {
          return Math.floor(100000 + Math.random() * 900000).toString();
     },

     /**
      * Marks an order as shipped.
      * @param {string} orderId 
      */
     async markAsShipped(orderId) {
          try {
               const orderRef = doc(db, "orders", orderId);
               await updateDoc(orderRef, {
                    status: "shipped",
                    "timestamps.shippedAt": serverTimestamp()
               });
               showToast("Order marked as shipped!", "success");
          } catch (error) {
               console.error("Error marking as shipped:", error);
               showToast("Failed to update order.", "error");
          }
     },

     /**
      * Confirms delivery using OTP and releases funds from escrow.
      * @param {string} orderId 
      * @param {string} otp 
      */
     async confirmDelivery(orderId, otp) {
          try {
               const orderRef = doc(db, "orders", orderId);
               const snap = await getDoc(orderRef);
               if (!snap.exists()) throw new Error("Order not found");

               const orderData = snap.data();
               if (orderData.deliveryOTP !== otp) {
                    throw new Error("Invalid OTP code");
               }

               await updateDoc(orderRef, {
                    status: "completed",
                    escrowStatus: "released",
                    otpUsed: true,
                    "timestamps.completedAt": serverTimestamp()
               });

               // Update seller analytics (simulated)
               await this.updateSellerRevenue(orderData.sellerId, orderData.sellerReceives);

               showToast("Delivery confirmed. Payment released!", "success");
               return true;
          } catch (error) {
               console.error("Delivery confirmation error:", error);
               showToast(error.message, "error");
               return false;
          }
     },

     /**
      * Updates seller revenue after escrow release.
      */
     async updateSellerRevenue(sellerId, amount) {
          const analyticsRef = doc(db, "analytics", sellerId);
          const snap = await getDoc(analyticsRef);
          if (!snap.exists()) return;

          const data = snap.data();
          await updateDoc(analyticsRef, {
               totalRevenue: (data.totalRevenue || 0) + amount,
               escrowHeld: Math.max(0, (data.escrowHeld || 0) - amount),
               escrowReleased: (data.escrowReleased || 0) + amount,
               totalSales: (data.totalSales || 0) + 1,
               lastUpdated: serverTimestamp()
          });
     }
};
