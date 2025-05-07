import { Poppins } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { AuthProvider } from "@/lib/auth";

const poppins = Poppins({
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
  variable: "--font-poppins",
});

export const metadata = {
  title: "Msaada Express",
  description: "Find the nearest ambulance service in an emergency",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${poppins.variable}`}>
         <AuthProvider> 
          <Navbar />
            {children}
          <Footer/>
         </AuthProvider> 
      </body>
    </html>
  );
}
