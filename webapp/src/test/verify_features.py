from playwright.sync_api import Page, expect, sync_playwright
import time
import random

def verify_inventory_features(page: Page):
    # Generate random email
    random_id = random.randint(1000, 9999)
    email = f"test{random_id}@example.com"

    # 1. Signup
    print("Navigating to signup...")
    page.goto("http://localhost:3000/signup")

    # Fill signup form
    print("Signing up...")
    page.fill('input[id="email"]', email)
    page.fill('input[id="password"]', "Password123!")
    page.fill('input[id="passwordConfirm"]', "Password123!")
    page.fill('input[id="name"]', "Test User")

    page.get_by_role("button", name="Create account").click()
    page.wait_for_url("http://localhost:3000/", timeout=10000)

    # 2. Navigate to Inventory
    print("Navigating to inventory...")
    page.goto("http://localhost:3000/inventory/items")

    # 3. Create Item
    print("Navigating to new item...")
    page.goto("http://localhost:3000/inventory/items/new")

    # Verify Comboboxes
    comboboxes = page.get_by_role("combobox").all()
    print(f"Found {len(comboboxes)} comboboxes")

    page.fill('input[name="item_label"]', f"Test Drill {random_id}")

    # Use Combobox - Functional (1st)
    page.get_by_role("combobox").nth(0).click()
    page.get_by_placeholder("Search e.g., tools...").fill("Tools")
    page.get_by_text('Create "Tools"').click()

    # Use Combobox - Specific (2nd)
    page.get_by_role("combobox").nth(1).click()
    page.get_by_placeholder("Search e.g., power tools...").fill("Power Tools")
    page.get_by_text('Create "Power Tools"').click()

    # Use Combobox - Type (3rd)
    page.get_by_role("combobox").nth(2).click()
    page.get_by_placeholder("Search e.g., drill...").fill("Drill")
    page.get_by_text('Create "Drill"').click()

    print("Taking screenshot of form...")
    page.screenshot(path="/home/jules/verification/1-item-form.png")

    # Save
    page.get_by_role("button", name="Save Item").click()

    # Wait for navigation
    page.wait_for_url("**/inventory/items/*")

    # 4. Clone
    print("Testing Clone...")
    page.get_by_role("button", name="Clone").click()
    page.wait_for_url("**/inventory/items/new?clone_from=*")

    page.wait_for_timeout(2000)
    print("Taking screenshot of clone page...")
    page.screenshot(path="/home/jules/verification/2-clone-page.png")

    # 5. Bulk Edit
    print("Navigating to items list...")
    page.goto("http://localhost:3000/inventory/items")

    # Click Select Items
    page.get_by_role("button", name="Select Items").click()

    # Select item
    page.get_by_text(f"Test Drill {random_id}").click()

    # Verify Bulk Action Bar
    page.wait_for_selector("text=1 selected")

    print("Taking screenshot of bulk selection...")
    page.screenshot(path="/home/jules/verification/3-bulk-selection.png")

    # Click Edit
    page.get_by_role("button", name="Edit").click()

    # Verify Dialog
    expect(page.get_by_role("dialog")).to_be_visible()

    print("Taking screenshot of bulk edit dialog...")
    page.screenshot(path="/home/jules/verification/4-bulk-edit-dialog.png")


if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()
        try:
            verify_inventory_features(page)
        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="/home/jules/verification/error.png")
        finally:
            browser.close()
