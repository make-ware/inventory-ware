from playwright.sync_api import Page, expect, sync_playwright
import time

def verify_bbox(page: Page):
    print("Navigating to test page...")
    page.goto("http://localhost:3000/test-bbox")

    # Wait for image to load
    print("Waiting for page load...")
    page.wait_for_selector("img", state="visible")
    page.wait_for_timeout(2000)

    expect(page.get_by_role("heading", name="Bounding Box Test")).to_be_visible()

    # Take initial screenshot
    print("Taking initial screenshot...")
    page.screenshot(path="/home/jules/verification/bbox_initial.png")

    # Interact with editor
    # Click and drag on the image in editor
    # The image is inside the BoundingBoxEditor

    # We need to find the container div to click on.
    # It has class "cursor-crosshair"
    editor_area = page.locator(".cursor-crosshair").first

    # Draw a box
    print("Drawing new box...")
    box = editor_area.bounding_box()
    if box:
        page.mouse.move(box["x"] + 100, box["y"] + 100)
        page.mouse.down()
        page.mouse.move(box["x"] + 300, box["y"] + 300)
        page.mouse.up()

    # Click Save
    print("Saving...")
    page.get_by_role("button", name="Save").click()

    # Wait for update
    page.wait_for_timeout(1000)

    # Take final screenshot
    print("Taking final screenshot...")
    page.screenshot(path="/home/jules/verification/bbox_updated.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_bbox(page)
        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="/home/jules/verification/error.png")
            raise e
        finally:
            browser.close()
