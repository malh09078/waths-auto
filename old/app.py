import pandas as pd

def convert_xlsx_to_csv(input_file, output_file):
    try:
        # Read the Excel file
        df = pd.read_excel(input_file, engine="openpyxl")

        # Save as CSV
        df.to_csv(output_file, index=False, encoding="utf-8")

        print(f"Conversion successful! CSV saved as: {output_file}")
    except Exception as e:
        print(f"Error: {e}")

# Example usage
xlsx_file = "/home/mfoud444/1project/personal-project/auto/w2/numbers.xlsx"  # Change this to your file name
csv_file = "contacts.csv"    # Output file name

convert_xlsx_to_csv(xlsx_file, csv_file)
