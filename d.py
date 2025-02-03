import pandas as pd

def convert_csv_for_google_contacts(input_file, output_file):
    try:
        # Read the original CSV
        df = pd.read_csv(input_file)

        # Rename columns to match Google Contacts format
        df.rename(columns={"phone number": "Phone Number", "name": "Full Name"}, inplace=True)

        # Split "Full Name" into "First Name" and "Last Name"
        name_split = df["Full Name"].str.split(" ", n=1, expand=True)
        df["First Name"] = name_split[0]  # First word as First Name
        df["Last Name"] = name_split[1].fillna("")  # Rest as Last Name (if available)

        # Reorder columns for Google Contacts
        df = df[["First Name", "Last Name", "Phone Number"]]

        # Save as CSV (Google Contacts compatible)
        df.to_csv(output_file, index=False, encoding="utf-8")

        print(f"Conversion successful! Saved as: {output_file}")
    except Exception as e:
        print(f"Error: {e}")

# Example usage
input_csv = "contacts.csv"  # Your input file
output_csv = "google_contacts.csv"  # Output file for Google Contacts

convert_csv_for_google_contacts(input_csv, output_csv)
